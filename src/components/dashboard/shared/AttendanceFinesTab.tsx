import { useState, useEffect } from 'react';
import { Pencil, Plus, Trash2, Search, X, CheckCircle2, ChevronDown, ChevronRight, Building2, Banknote, Globe, Wallet, Download, Snowflake, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/useAuth';
import { 
  getStaffAttendanceFines, 
  deleteAttendanceCategory, 
  createAttendanceCategory, 
  updateAttendanceCategory, 
  clearStudentFine, 
  overrideAttendanceFine,
  isFirstYearSem,
  getAllDepartments,
  getAttendanceFreezeStatus,
  setAttendanceFreezeStatus,
} from '../../../lib/api';

interface AttendanceFinesTabProps {
  departmentId?: string;
  role: 'hod' | 'fyc' | 'staff' | 'clerk' | 'admin';
}

export default function AttendanceFinesTab({ departmentId, role }: AttendanceFinesTabProps) {
  const { profile } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  const [attendanceFines, setAttendanceFines] = useState<any[]>([]);
  const [loadingAttendances, setLoadingAttendances] = useState(false);
  const [searchAttendances, setSearchAttendances] = useState('');
  
  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ label: '', minPct: '', maxPct: '', amount: '' });
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [reduceFineId, setReduceFineId] = useState<string | null>(null);
  const [reduceFineAmount, setReduceFineAmount] = useState('');
  const [reduceFineLoading, setReduceFineLoading] = useState(false);
  
  const [clearFineLoading, setClearFineLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // FYC/Admin needs all departments to create categories globally
  const [allDepartments, setAllDepartments] = useState<any[]>([]);

  // Fine collection summary state
  const [fineSummary, setFineSummary] = useState<any[]>([]);
  const [loadingFineSummary, setLoadingFineSummary] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  // Attendance freeze state
  const [attendanceFrozen, setAttendanceFrozen] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);

  // Fine summary manual-refresh state
  const [refreshing, setRefreshing] = useState(false);

  const isFycGlobal = role === 'fyc' && !departmentId;
  const isAdminGlobal = role === 'admin';
  const canManageCategories = role === 'admin';
  const canViewCategories = role === 'admin' || role === 'hod' || role === 'fyc';
  const canModifyFines = role === 'admin' || role === 'hod' || role === 'fyc';
  const showFineSummary = role === 'admin' || role === 'hod' || role === 'fyc';

  // Load departments for FYC/Admin (needed for global category creation)
  useEffect(() => {
    if (isFycGlobal || isAdminGlobal) {
      getAllDepartments().then(depts => {
        setAllDepartments(depts || []);
      }).catch(console.error);
    }
  }, [role, departmentId]);

  // Load freeze status for any role (so banner shows for faculty/hod/fyc)
  useEffect(() => {
    if (!profile?.tenant_id) return;
    getAttendanceFreezeStatus(profile.tenant_id)
      .then(setAttendanceFrozen)
      .catch(console.error);
  }, [profile?.tenant_id]);

  const handleToggleFreeze = async () => {
    if (!profile?.tenant_id) return;
    setFreezeLoading(true);
    try {
      const next = !attendanceFrozen;
      await setAttendanceFreezeStatus(profile.tenant_id, next);
      setAttendanceFrozen(next);
      setSuccessMsg(next
        ? '🔒 Attendance frozen — faculty cannot update until unfrozen.'
        : '🔓 Attendance unfrozen — faculty can now update attendance.');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error(err);
      alert('Failed to update freeze status: ' + err.message);
    } finally {
      setFreezeLoading(false);
    }
  };

  /** Manually re-fetch all fines data — useful after faculty updates attendance */
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchAttendanceFines(),
        showFineSummary ? fetchFineSummary() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (canViewCategories) fetchAttendanceCategories();
    fetchAttendanceFines();
    if (showFineSummary) fetchFineSummary();
  }, [departmentId, role, allDepartments]);

  const fetchAttendanceCategories = async () => {
    setLoadingCategories(true);
    try {
      if (isAdminGlobal) {
        // Admin: fetch categories from first dept, deduplicate by key fields
        if (allDepartments.length > 0) {
          const { data, error } = await supabase
            .from('attendance_fine_categories')
            .select('*')
            .eq('department_id', allDepartments[0].id)
            .eq('is_first_year', false)
            .order('min_pct');
          if (error) throw error;
          // Deduplicate by label+min+max+amount in case of duplicate DB rows
          const seen = new Set<string>();
          const unique = (data || []).filter(c => {
            const key = `${c.label}|${c.min_pct}|${c.max_pct}|${c.fine_amount}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setCategories(unique);
        } else {
          setCategories([]);
        }
      } else if (isFycGlobal) {
        // FYC: read from is_first_year=false (admin's canonical source).
        // Stale old categories (55-64, 65-74) only exist as is_first_year=true
        // and are therefore not shown. Admin-created categories (Fourth/Third/…)
        // exist in both values, so they show correctly here.
        if (allDepartments.length > 0) {
          const { data, error } = await supabase
            .from('attendance_fine_categories')
            .select('*')
            .eq('department_id', allDepartments[0].id)
            .eq('is_first_year', false)
            .order('id', { ascending: false }); // newest first → stale dupes skipped
          if (error) throw error;
          // Deduplicate by range — keeps newest record for each min/max pair
          const seen = new Set<string>();
          const unique = (data || []).filter(c => {
            const key = `${c.min_pct}|${c.max_pct}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setCategories(unique.sort((a, b) => a.min_pct - b.min_pct));
        } else {
          setCategories([]);
        }
      } else if (departmentId) {
        // HOD: fetch non-first-year categories; deduplicate by range (newest wins)
        const { data, error } = await supabase
          .from('attendance_fine_categories')
          .select('*')
          .eq('department_id', departmentId)
          .eq('is_first_year', false)
          .order('id', { ascending: false }); // newest first
        if (error) throw error;
        // Deduplicate by range — prevents stale renamed categories from appearing
        const seen = new Set<string>();
        const unique = (data || []).filter(c => {
          const key = `${c.min_pct}|${c.max_pct}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setCategories(unique.sort((a, b) => a.min_pct - b.min_pct));
      }
    } catch (err) { console.error(err); }
    finally { setLoadingCategories(false); }
  };

  const fetchAttendanceFines = async () => {
    setLoadingAttendances(true);
    try {
      let allData: any[] = [];
      if (departmentId) {
        allData = await getStaffAttendanceFines(departmentId);
      } else {
        // FYC/Admin: fetch all fined/rejected enrollments across all departments
        const { data, error } = await supabase
          .from('subject_enrollment')
          .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, roll_number, section, department_id, semester_id, semesters(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
          .or('status.eq.rejected,attendance_fee.gt.0');
        if (error) throw error;
        allData = data || [];
      }
      const filtered = (allData || []).filter((item: any) => {
        const semName = item.profiles?.semesters?.name || '';
        if (role === 'admin') return true; // Admin sees all semesters
        if (role === 'staff' || role === 'hod') return !isFirstYearSem(semName);
        if (role === 'clerk' || role === 'fyc') return isFirstYearSem(semName);
        return true;
      });
      setAttendanceFines(filtered);
    } catch (err) { console.error(err); }
    finally { setLoadingAttendances(false); }
  };

  const handleSaveCategory = async () => {
    if (!catForm.label || !catForm.minPct || !catForm.maxPct || !catForm.amount) {
      setCatError('All fields are required.');
      return;
    }
    const min = parseInt(catForm.minPct);
    const max = parseInt(catForm.maxPct);
    const amt = parseInt(catForm.amount);
    if (min >= max) {
      setCatError('Min percentage must be less than Max percentage.');
      return;
    }
    setCatSaving(true);
    setCatError(null);
    try {
      if (editingCat) {
        console.log('Updating category:', editingCat.id, { label: catForm.label, min, max, amt });
        await updateAttendanceCategory(editingCat.id, catForm.label, min, max, amt);
        console.log('Category updated successfully');
        // FYC/Admin: also update matching categories in other departments
        if (isFycGlobal || isAdminGlobal) {
          const matchFilter = supabase
            .from('attendance_fine_categories')
            .select('id')
            .eq('label', editingCat.label)
            .eq('min_pct', editingCat.min_pct)
            .eq('max_pct', editingCat.max_pct)
            .neq('id', editingCat.id);
          if (isFycGlobal) matchFilter.eq('is_first_year', true);
          const { data: matching } = await matchFilter;
          for (const m of (matching || [])) {
            await updateAttendanceCategory(m.id, catForm.label, min, max, amt);
          }
        }
      } else {
        if (isAdminGlobal) {
          // Admin: create in ALL departments for BOTH first_year and non-first_year
          if (allDepartments.length === 0) {
            setCatError('No departments loaded. Please try again.');
            setCatSaving(false);
            return;
          }
          let created = 0;
          for (const dept of allDepartments) {
            for (const isfy of [true, false]) {
              try {
                await createAttendanceCategory(dept.id, catForm.label, min, max, amt, isfy);
                created++;
              } catch (err: any) {
                console.warn(`Failed for ${dept.name} (fy=${isfy}):`, err.message);
              }
            }
          }
          if (created === 0) throw new Error('Failed to create category in any department.');
        } else if (isFycGlobal) {
          if (allDepartments.length === 0) {
            setCatError('No departments loaded. Please try again.');
            setCatSaving(false);
            return;
          }
          let created = 0;
          for (const dept of allDepartments) {
            try {
              await createAttendanceCategory(dept.id, catForm.label, min, max, amt, true);
              created++;
            } catch (err: any) {
              console.warn(`Failed to create category for ${dept.name}:`, err.message);
            }
          }
          if (created === 0) throw new Error('Failed to create category in any department.');
        } else if (departmentId) {
          await createAttendanceCategory(departmentId, catForm.label, min, max, amt, false);
        } else {
          setCatError('Department not available.');
          setCatSaving(false);
          return;
        }
      }
      // Directly re-apply ALL category fines to matching students
      const updatedCount = await reapplyAllCategoryFines();
      setShowCatModal(false);
      setEditingCat(null);
      fetchAttendanceCategories();
      fetchAttendanceFines();
      // Show success feedback with actual count
      const action = editingCat ? 'updated' : 'created';
      setSuccessMsg(`✅ Category ${action} — ${updatedCount} student fine(s) applied!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Save category error:', err);
      setCatError(err.message || 'Failed to save category');
    } finally {
      setCatSaving(false);
    }
  };

  const reapplyAllCategoryFines = async (): Promise<number> => {
    let totalUpdated = 0;
    if (isAdminGlobal && allDepartments.length > 0) {
      // Admin: apply fines across ALL depts for both first_year and non-first_year
      for (const dept of allDepartments) {
        for (const isfy of [true, false]) {
          const { data, error } = await supabase.rpc('rpc_apply_mass_fines', {
            p_department_id: dept.id,
            p_is_first_year: isfy,
          });
          if (error) console.warn(`Failed for ${dept.name} (fy=${isfy}):`, error.message);
          else totalUpdated += (data as any)?.updated || 0;
        }
      }
    } else if (isFycGlobal && allDepartments.length > 0) {
      for (const dept of allDepartments) {
        const { data, error } = await supabase.rpc('rpc_apply_mass_fines', {
          p_department_id: dept.id,
          p_is_first_year: true,
        });
        if (error) throw new Error(`Failed for ${dept.name}: ${error.message}`);
        totalUpdated += (data as any)?.updated || 0;
      }
    } else if (departmentId) {
      const isFirstYear = role === 'fyc';
      const { data, error } = await supabase.rpc('rpc_apply_mass_fines', {
        p_department_id: departmentId,
        p_is_first_year: isFirstYear,
      });
      if (error) throw new Error(error.message);
      totalUpdated = (data as any)?.updated || 0;
    }
    return totalUpdated;
  };


  const handleDeleteCategory = async (cat: any) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteAttendanceCategory(cat.id);
      
      // Admin/FYC: also delete matching categories in other departments
      if (isAdminGlobal || isFycGlobal) {
        const matchFilter = supabase
          .from('attendance_fine_categories')
          .select('id')
          .eq('label', cat.label)
          .eq('min_pct', cat.min_pct)
          .eq('max_pct', cat.max_pct);
        if (isFycGlobal) matchFilter.eq('is_first_year', true);
        const { data: matching } = await matchFilter;
        for (const m of (matching || [])) {
          if (m.id !== cat.id) await deleteAttendanceCategory(m.id);
        }
      }
      fetchAttendanceCategories();
    } catch (err) { console.error(err); }
  };

  // ==================== FINE COLLECTION SUMMARY ====================
  const fetchFineSummary = async () => {
    setLoadingFineSummary(true);
    try {
      // 1. Fetch all enrollments with attendance_fee > 0
      let allFines: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('subject_enrollment')
          .select('id, attendance_fee, attendance_fee_verified, profiles!subject_enrollment_student_id_fkey!inner(department_id, departments!profiles_department_id_fkey(name), semester_id, semesters(name))')
          .gt('attendance_fee', 0)
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allFines = allFines.concat(data);
        if (data.length < 1000) break;
        from += 1000;
      }

      // 2. Fetch all paid payment_orders for attendance fines
      const { data: paidOrders, error: poErr } = await supabase
        .from('payment_orders')
        .select('enrollment_id, enrollment_ids, amount_paid')
        .eq('status', 'paid')
        .in('due_type', ['attendance_fine', 'attendance_fine_bulk']);
      if (poErr) throw poErr;

      // Build set of enrollment_ids that were paid online
      const onlinePaidIds = new Set<string>();
      for (const order of (paidOrders || [])) {
        if (order.enrollment_id) onlinePaidIds.add(order.enrollment_id);
        if (order.enrollment_ids && Array.isArray(order.enrollment_ids)) {
          for (const eid of order.enrollment_ids) onlinePaidIds.add(eid);
        }
      }

      // 3. Filter by role
      const filtered = allFines.filter((item: any) => {
        const semName = item.profiles?.semesters?.name || '';
        if (role === 'hod' && departmentId) return item.profiles?.department_id === departmentId && !isFirstYearSem(semName);
        if (role === 'fyc') return isFirstYearSem(semName);
        return true; // admin sees all
      });

      // 4. Group by department (+ semester breakdown per dept)
      type SemRow = { semName: string; cashPaid: number; cashCount: number; onlinePaid: number; onlineCount: number; pendingAmount: number; pendingCount: number };
      const deptMap: Record<string, { name: string; cashPaid: number; cashCount: number; onlinePaid: number; onlineCount: number; pendingAmount: number; pendingCount: number; semBreakdown: Record<string, SemRow> }> = {};
      for (const item of filtered) {
        const deptName = item.profiles?.departments?.name || 'Unassigned';
        const deptId = item.profiles?.department_id || 'unknown';
        if (!deptMap[deptId]) deptMap[deptId] = { name: deptName, cashPaid: 0, cashCount: 0, onlinePaid: 0, onlineCount: 0, pendingAmount: 0, pendingCount: 0, semBreakdown: {} };

        const fee = item.attendance_fee || 0;
        const semName = item.profiles?.semesters?.name || 'Unknown';
        const semId = item.profiles?.semester_id || 'unknown';
        if (!deptMap[deptId].semBreakdown[semId]) {
          deptMap[deptId].semBreakdown[semId] = { semName, cashPaid: 0, cashCount: 0, onlinePaid: 0, onlineCount: 0, pendingAmount: 0, pendingCount: 0 };
        }

        if (item.attendance_fee_verified) {
          if (onlinePaidIds.has(item.id)) {
            deptMap[deptId].onlinePaid += fee; deptMap[deptId].onlineCount++;
            deptMap[deptId].semBreakdown[semId].onlinePaid += fee; deptMap[deptId].semBreakdown[semId].onlineCount++;
          } else {
            deptMap[deptId].cashPaid += fee; deptMap[deptId].cashCount++;
            deptMap[deptId].semBreakdown[semId].cashPaid += fee; deptMap[deptId].semBreakdown[semId].cashCount++;
          }
        } else {
          deptMap[deptId].pendingAmount += fee; deptMap[deptId].pendingCount++;
          deptMap[deptId].semBreakdown[semId].pendingAmount += fee; deptMap[deptId].semBreakdown[semId].pendingCount++;
        }
      }

      const summary = Object.entries(deptMap).map(([id, data]) => ({ deptId: id, ...data })).sort((a, b) => a.name.localeCompare(b.name));
      setFineSummary(summary);
    } catch (err) { console.error('Failed to fetch fine summary:', err); }
    finally { setLoadingFineSummary(false); }
  };

  const toggleDept = (deptId: string) => {
    const next = new Set(expandedDepts);
    if (next.has(deptId)) next.delete(deptId);
    else next.add(deptId);
    setExpandedDepts(next);
  };


  const handleReduceFine = async (enrollmentId: string) => {
    const amt = parseInt(reduceFineAmount);
    if (isNaN(amt) || amt < 0) return;
    setReduceFineLoading(true);
    try {
      await overrideAttendanceFine(enrollmentId, amt);
      setReduceFineId(null);
      fetchAttendanceFines();
    } catch (err) { console.error(err); }
    finally { setReduceFineLoading(false); }
  };

  const handleClearFine = async (enrollmentId: string) => {
    if (!confirm('Mark this fine as PAID (cash payment)? This will clear the subject requirement.')) return;
    setClearFineLoading(enrollmentId);
    try {
      await clearStudentFine(enrollmentId);
      fetchAttendanceFines();
    } catch (err: any) {
      alert(err.message || 'Failed to clear fine');
    } finally {
      setClearFineLoading(null);
    }
  };

  const handleExportFineSummary = () => {
    if (fineSummary.length === 0) { alert('No fine data to export.'); return; }
    const totalCash = fineSummary.reduce((s, d) => s + d.cashPaid, 0);
    const totalOnline = fineSummary.reduce((s, d) => s + d.onlinePaid, 0);
    const totalPending = fineSummary.reduce((s, d) => s + d.pendingAmount, 0);
    const header = 'Department,Cash Collected (₹),Cash Students,Online Paid (₹),Online Students,Pending Amount (₹),Pending Students,Total Collected (₹)\n';
    const rows = fineSummary.map(d =>
      `"${d.name}",${d.cashPaid},${d.cashCount},${d.onlinePaid},${d.onlineCount},${d.pendingAmount},${d.pendingCount},${d.cashPaid + d.onlinePaid}`
    ).join('\n');
    const totalRow = `\n"TOTAL",${totalCash},${fineSummary.reduce((s, d) => s + d.cashCount, 0)},${totalOnline},${fineSummary.reduce((s, d) => s + d.onlineCount, 0)},${totalPending},${fineSummary.reduce((s, d) => s + d.pendingCount, 0)},${totalCash + totalOnline}`;
    const blob = new Blob([header + rows + totalRow], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fine_collection_summary_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">

      {/* ============ FREEZE BANNER (visible to all when frozen) ============ */}
      {attendanceFrozen && !isAdminGlobal && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
          <Snowflake className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Attendance is currently frozen</p>
            <p className="text-xs text-muted-foreground mt-0.5">The admin has frozen attendance updates. You cannot upload or manually update attendance until it is unfrozen.</p>
          </div>
        </div>
      )}

      {/* ==================== FINE COLLECTION SUMMARY ==================== */}
      {showFineSummary && (
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Fine Collection Summary
                {isAdminGlobal && <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-2">All Departments</span>}
                {role === 'hod' && <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full ml-2">Your Department</span>}
                {role === 'fyc' && <span className="text-xs font-medium bg-violet-500/10 text-violet-600 px-2 py-0.5 rounded-full ml-2">Sem 1 & 2</span>}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">Attendance fine collection breakdown by department — Cash vs Online Payment.</p>
            </div>
            {/* Refresh + Freeze toggle (admin only) + Export CSV */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Refresh button — visible to all roles so they can pull latest data after faculty updates */}
              <button
                id="refresh-fine-summary"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-all shadow-sm text-sm bg-secondary hover:bg-secondary/80 text-foreground border border-border disabled:opacity-50"
                title="Reload fines data — use this after faculty updates attendance to see the latest amounts"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              {isAdminGlobal && (
                <button
                  id="attendance-freeze-toggle"
                  onClick={handleToggleFreeze}
                  disabled={freezeLoading}
                  className={`flex items-center gap-2 px-5 py-2.5 font-bold rounded-xl transition-all shadow-sm text-sm ${
                    attendanceFrozen
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground border border-border'
                  }`}
                  title={attendanceFrozen ? 'Click to unfreeze attendance (faculty will be able to update again)' : 'Click to freeze attendance (faculty cannot update)'}
                >
                  <Snowflake className="w-4 h-4" />
                  {freezeLoading ? 'Updating…' : attendanceFrozen ? 'Unfreeze Attendance' : 'Freeze Attendance'}
                </button>
              )}
              {fineSummary.length > 0 && (
                <button
                  onClick={handleExportFineSummary}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all shadow-sm text-sm"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {loadingFineSummary ? (
            <div className="p-6 text-center text-muted-foreground animate-pulse text-sm">Loading fine summary...</div>
          ) : fineSummary.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-border rounded-2xl">
              <p className="text-muted-foreground text-sm">No attendance fines found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Totals row */}
              {fineSummary.length > 1 && (() => {
                const totalCash = fineSummary.reduce((s, d) => s + d.cashPaid, 0);
                const totalOnline = fineSummary.reduce((s, d) => s + d.onlinePaid, 0);
                const totalPending = fineSummary.reduce((s, d) => s + d.pendingAmount, 0);
                return (
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 mb-3">
                    <div className="flex flex-wrap gap-6 items-center">
                      <span className="font-bold text-foreground">College Total</span>
                      <span className="flex items-center gap-1.5 text-sm"><Wallet className="w-4 h-4 text-emerald-500" /><span className="font-bold text-emerald-600">Cash: ₹{totalCash.toLocaleString()}</span></span>
                      <span className="flex items-center gap-1.5 text-sm"><Globe className="w-4 h-4 text-blue-500" /><span className="font-bold text-blue-600">Online: ₹{totalOnline.toLocaleString()}</span></span>
                      <span className="flex items-center gap-1.5 text-sm"><Banknote className="w-4 h-4 text-amber-500" /><span className="font-bold text-amber-600">Pending: ₹{totalPending.toLocaleString()}</span></span>
                      <span className="font-bold text-foreground ml-auto">Collected: ₹{(totalCash + totalOnline).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}

              {fineSummary.map(dept => (
                <div key={dept.deptId} className="border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => toggleDept(dept.deptId)}
                    className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {expandedDepts.has(dept.deptId) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <span className="font-bold text-foreground">{dept.name}</span>
                      <span className="text-xs bg-secondary px-2 py-0.5 rounded-md text-muted-foreground">
                        {dept.cashCount + dept.onlineCount + dept.pendingCount} fines
                      </span>
                    </div>
                    <span className="font-bold text-foreground">₹{(dept.cashPaid + dept.onlinePaid).toLocaleString()}</span>
                  </button>
                  {expandedDepts.has(dept.deptId) && (
                    <div className="border-t border-border bg-secondary/10">
                      {/* Summary tiles */}
                      <div className="px-4 pt-4 pb-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Wallet className="w-3 h-3" /> Cash Collected</div>
                          <div className="text-lg font-bold text-emerald-600">₹{dept.cashPaid.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{dept.cashCount} student(s)</div>
                        </div>
                        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Globe className="w-3 h-3" /> Online Payment</div>
                          <div className="text-lg font-bold text-blue-600">₹{dept.onlinePaid.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{dept.onlineCount} student(s)</div>
                        </div>
                        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Banknote className="w-3 h-3" /> Pending</div>
                          <div className="text-lg font-bold text-amber-600">₹{dept.pendingAmount.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{dept.pendingCount} student(s)</div>
                        </div>
                      </div>
                      {/* Semester-wise breakdown (admin only) */}
                      {isAdminGlobal && dept.semBreakdown && Object.keys(dept.semBreakdown).length > 0 && (
                        <div className="px-4 pb-4">
                          <div className="text-xs font-semibold text-muted-foreground mb-2 mt-1 uppercase tracking-wide">Semester-wise Breakdown</div>
                          <div className="overflow-x-auto rounded-xl border border-border">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-secondary/60 text-foreground border-b border-border">
                                  <th className="px-3 py-2 font-semibold">Semester</th>
                                  <th className="px-3 py-2 font-semibold text-emerald-600">Cash (₹)</th>
                                  <th className="px-3 py-2 font-semibold text-blue-600">Online (₹)</th>
                                  <th className="px-3 py-2 font-semibold text-amber-600">Pending (₹)</th>
                                  <th className="px-3 py-2 font-semibold text-right">Collected (₹)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {Object.values(dept.semBreakdown)
                                  .sort((a: any, b: any) => a.semName.localeCompare(b.semName, undefined, { numeric: true }))
                                  .map((sem: any, si: number) => (
                                    <tr key={si} className="hover:bg-secondary/20">
                                      <td className="px-3 py-2 font-medium">{sem.semName}</td>
                                      <td className="px-3 py-2 text-emerald-600 font-bold">₹{sem.cashPaid.toLocaleString()} <span className="text-muted-foreground font-normal">({sem.cashCount})</span></td>
                                      <td className="px-3 py-2 text-blue-600 font-bold">₹{sem.onlinePaid.toLocaleString()} <span className="text-muted-foreground font-normal">({sem.onlineCount})</span></td>
                                      <td className="px-3 py-2 text-amber-600 font-bold">₹{sem.pendingAmount.toLocaleString()} <span className="text-muted-foreground font-normal">({sem.pendingCount})</span></td>
                                      <td className="px-3 py-2 text-right font-bold">₹{(sem.cashPaid + sem.onlinePaid).toLocaleString()}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== CATEGORIES (view for hod/fyc, manage for admin) ==================== */}
      {canViewCategories && (
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Pencil className="w-5 h-5 text-amber-500" />
                Attendance Fine Categories
                {isAdminGlobal && <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-2">All Semesters · All Departments</span>}
                {isFycGlobal && <span className="text-xs font-medium bg-violet-500/10 text-violet-600 px-2 py-0.5 rounded-full ml-2">Sem 1 & 2 · All Departments</span>}
                {role === 'hod' && <span className="text-xs font-medium bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full ml-2">Sem 3–8 · Your Department</span>}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                {isAdminGlobal
                  ? 'Manage fine categories for all students (Sem 1–8) across every department.'
                  : isFycGlobal
                  ? 'View fine categories for first-year students (Sem 1 & 2).'
                  : 'View attendance % ranges and their corresponding fine amounts for your department (Sem 3–8).'}
              </p>
            </div>
            {canManageCategories && (
              <button
                onClick={() => { setEditingCat(null); setCatForm({ label: '', minPct: '', maxPct: '', amount: '' }); setCatError(null); setShowCatModal(true); }}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Category
              </button>
            )}
          </div>

          {/* Success feedback */}
          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {successMsg}
            </div>
          )}

          {loadingCategories ? (
            <div className="p-4 text-center text-muted-foreground animate-pulse text-sm">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-border rounded-2xl">
              <p className="text-muted-foreground text-sm">{canManageCategories ? 'No categories configured yet. Create categories to enable mass fine assignment.' : 'No categories configured yet.'}</p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                    <th className="p-3 font-semibold">Label</th>
                    <th className="p-3 font-semibold text-center">Min %</th>
                    <th className="p-3 font-semibold text-center">Max %</th>
                    <th className="p-3 font-semibold text-center">Fine (₹)</th>
                    {canManageCategories && <th className="p-3 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {categories.map((cat: any) => (
                    <tr key={cat.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-3 font-medium text-foreground">{cat.label}</td>
                      <td className="p-3 text-center"><span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-md text-xs font-bold">{cat.min_pct}%</span></td>
                      <td className="p-3 text-center"><span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-md text-xs font-bold">{cat.max_pct}%</span></td>
                      <td className="p-3 text-center font-bold text-amber-600">₹{cat.fine_amount}</td>
                      {canManageCategories && (
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && canManageCategories && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-foreground">{editingCat ? 'Edit Category' : 'Add Category'}</h3>
              <button onClick={() => setShowCatModal(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {catError && <div className="p-3 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">{catError}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Label</label>
                <input type="text" placeholder="e.g. Moderate Shortage" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.label} onChange={e => setCatForm({...catForm, label: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Min Attendance %</label>
                  <input type="number" min="0" max="100" placeholder="e.g. 65" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.minPct} onChange={e => setCatForm({...catForm, minPct: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Max Attendance %</label>
                  <input type="number" max="100" placeholder="e.g. 79" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.maxPct} onChange={e => setCatForm({...catForm, maxPct: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Fine Amount (₹)</label>
                <input type="number" min="0" placeholder="e.g. 500" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.amount} onChange={e => setCatForm({...catForm, amount: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowCatModal(false)} className="flex-1 py-3 px-4 rounded-xl border border-border font-medium hover:bg-secondary">Cancel</button>
              <button onClick={handleSaveCategory} disabled={catSaving} className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50">
                {catSaving ? 'Saving...' : editingCat ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by student or subject..."
            className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
            value={searchAttendances}
            onChange={e => setSearchAttendances(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
        </div>
      </div>
      

      
      {/* Students Table */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        {loadingAttendances ? (
          <div className="p-8 text-center text-muted-foreground animate-pulse">Loading rejected attendances...</div>
        ) : (() => {
          const filtered = attendanceFines.filter(item =>
            item.profiles?.full_name?.toLowerCase().includes(searchAttendances.toLowerCase()) ||
            item.subjects?.subject_name?.toLowerCase().includes(searchAttendances.toLowerCase()) ||
            item.subjects?.subject_code?.toLowerCase().includes(searchAttendances.toLowerCase())
          );
          return filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No students are currently rejected due to low attendance.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                    <th className="p-4 font-semibold">Student Name</th>
                    <th className="p-4 font-semibold">USN</th>
                    <th className="p-4 font-semibold">Section</th>
                    <th className="p-4 font-semibold">Subject</th>
                    <th className="p-4 font-semibold text-center">Attendance %</th>
                    <th className="p-4 font-semibold text-center">Fine (₹)</th>
                    <th className="p-4 font-semibold text-center">Status</th>
                    {canModifyFines && <th className="p-4 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-4 font-medium text-foreground">{item.profiles?.full_name}</td>
                      <td className="p-4 text-sm font-mono text-muted-foreground">{item.profiles?.roll_number || '—'}</td>
                      <td className="p-4"><span className="px-2 py-1 bg-secondary rounded-md text-xs font-medium">{item.profiles?.section || 'None'}</span></td>
                      <td className="p-4">
                        <div className="text-sm font-medium">{item.subjects?.subject_name}</div>
                        <div className="text-xs text-muted-foreground">{item.subjects?.subject_code}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-destructive font-bold">{item.attendance_pct}%</span>
                      </td>
                      <td className="p-4 text-center">
                        {item.attendance_fee > 0 ? (
                          <span className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap ${item.attendance_fee_verified ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                            ₹{item.attendance_fee}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not set</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {item.attendance_fee_verified ? (
                          <span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">Paid</span>
                        ) : item.attendance_fee > 0 ? (
                          <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600">Pending</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-bold bg-secondary text-muted-foreground">No Fine</span>
                        )}
                      </td>
                      {canModifyFines && (
                      <td className="p-4 text-right">
                        {reduceFineId === item.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <input
                              type="number"
                              min="0"
                              placeholder="₹"
                              className="w-24 p-2 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold"
                              value={reduceFineAmount}
                              onChange={e => setReduceFineAmount(e.target.value)}
                              autoFocus
                            />
                            <button onClick={() => handleReduceFine(item.id)} disabled={reduceFineLoading} className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors">
                              {reduceFineLoading ? '...' : 'Set'}
                            </button>
                            <button onClick={() => { setReduceFineId(null); setReduceFineAmount(''); }} className="px-2 py-2 bg-secondary hover:bg-secondary/80 rounded-xl transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => { setReduceFineId(item.id); setReduceFineAmount(String(item.attendance_fee || 0)); }}
                              className="px-3 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                            >
                              Modify Fine
                            </button>
                            {item.attendance_fee > 0 && !item.attendance_fee_verified && (
                              <button
                                onClick={() => handleClearFine(item.id)}
                                disabled={clearFineLoading === item.id}
                                className="px-3 py-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                              >
                                {clearFineLoading === item.id ? '...' : 'Clear Fine'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
