import { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, Search, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { 
  getStaffAttendanceFines, 
  deleteAttendanceCategory, 
  createAttendanceCategory, 
  updateAttendanceCategory, 
  clearStudentFine, 
  overrideAttendanceFine,
  isFirstYearSem,
  getAllDepartments
} from '../../../lib/api';

interface AttendanceFinesTabProps {
  departmentId?: string;
  role: 'hod' | 'fyc' | 'staff' | 'clerk';
}

export default function AttendanceFinesTab({ departmentId, role }: AttendanceFinesTabProps) {
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

  // FYC needs all departments to create categories globally
  const [allDepartments, setAllDepartments] = useState<any[]>([]);

  const isFycGlobal = role === 'fyc' && !departmentId;
  const canManageCategories = role === 'hod' || role === 'fyc';

  // Load departments for FYC (needed for global category creation)
  useEffect(() => {
    if (isFycGlobal) {
      getAllDepartments().then(depts => {
        setAllDepartments(depts || []);
      }).catch(console.error);
    }
  }, [role, departmentId]);

  useEffect(() => {
    if (canManageCategories) fetchAttendanceCategories();
    fetchAttendanceFines();
  }, [departmentId, role, allDepartments]);

  const fetchAttendanceCategories = async () => {
    setLoadingCategories(true);
    try {
      if (isFycGlobal) {
        // FYC: fetch all first-year categories (RLS filters to is_first_year=true)
        // Since identical categories exist in all depts, pick from the first dept to avoid duplicates
        if (allDepartments.length > 0) {
          const { data, error } = await supabase
            .from('attendance_fine_categories')
            .select('*')
            .eq('department_id', allDepartments[0].id)
            .eq('is_first_year', true)
            .order('min_pct');
          if (error) throw error;
          setCategories(data || []);
        } else {
          setCategories([]);
        }
      } else if (departmentId) {
        // HOD/Staff: fetch non-first-year categories for their department
        const { data, error } = await supabase
          .from('attendance_fine_categories')
          .select('*')
          .eq('department_id', departmentId)
          .eq('is_first_year', false)
          .order('min_pct');
        if (error) throw error;
        setCategories(data || []);
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
        // FYC: fetch all rejected enrollments across all departments
        const { data, error } = await supabase
          .from('subject_enrollment')
          .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, roll_number, section, department_id, semester_id, semesters(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
          .eq('status', 'rejected');
        if (error) throw error;
        allData = data || [];
      }
      const filtered = (allData || []).filter((item: any) => {
        const semName = item.profiles?.semesters?.name || '';
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
        await updateAttendanceCategory(editingCat.id, catForm.label, min, max, amt);
        // FYC: also update matching categories in other departments
        if (isFycGlobal) {
          const { data: matching } = await supabase
            .from('attendance_fine_categories')
            .select('id')
            .eq('label', editingCat.label)
            .eq('min_pct', editingCat.min_pct)
            .eq('max_pct', editingCat.max_pct)
            .eq('is_first_year', true)
            .neq('id', editingCat.id);
          for (const m of (matching || [])) {
            await updateAttendanceCategory(m.id, catForm.label, min, max, amt);
          }
        }
      } else {
        if (isFycGlobal) {
          // FYC: create category in ALL departments with is_first_year=true
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
          // HOD: create for their department only with is_first_year=false
          await createAttendanceCategory(departmentId, catForm.label, min, max, amt, false);
        } else {
          setCatError('Department not available.');
          setCatSaving(false);
          return;
        }
      }
      setShowCatModal(false);
      fetchAttendanceCategories();
    } catch (err: any) {
      setCatError(err.message || 'Failed to save category');
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (cat: any) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteAttendanceCategory(cat.id);
      
      // FYC: also delete matching categories in other departments
      if (isFycGlobal) {
        const { data: matching } = await supabase
          .from('attendance_fine_categories')
          .select('id')
          .eq('label', cat.label)
          .eq('min_pct', cat.min_pct)
          .eq('max_pct', cat.max_pct)
          .eq('is_first_year', true);
        for (const m of (matching || [])) {
          if (m.id !== cat.id) await deleteAttendanceCategory(m.id);
        }
      }
      fetchAttendanceCategories();
    } catch (err) { console.error(err); }
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

  return (
    <div className="space-y-6">
      {canManageCategories && (
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-500" />
                Attendance Fine Categories
                {isFycGlobal && <span className="text-xs font-medium bg-violet-500/10 text-violet-600 px-2 py-0.5 rounded-full ml-2">Sem 1 & 2 · All Departments</span>}
                {role === 'hod' && <span className="text-xs font-medium bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full ml-2">Sem 3–8 · Your Department</span>}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                {isFycGlobal
                  ? 'Define fine categories for all first-year students (Sem 1 & 2). These apply to every branch automatically.'
                  : 'Define attendance % ranges and their corresponding fine amounts for your department (Sem 3–8).'}
              </p>
            </div>
            <button
              onClick={() => { setEditingCat(null); setCatForm({ label: '', minPct: '', maxPct: '', amount: '' }); setCatError(null); setShowCatModal(true); }}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Category
            </button>
          </div>

          {loadingCategories ? (
            <div className="p-4 text-center text-muted-foreground animate-pulse text-sm">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-border rounded-2xl">
              <p className="text-muted-foreground text-sm">No categories configured yet. Create categories to enable mass fine assignment.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                    <th className="p-3 font-semibold">Label</th>
                    <th className="p-3 font-semibold text-center">Min %</th>
                    <th className="p-3 font-semibold text-center">Max %</th>
                    <th className="p-3 font-semibold text-center">Fine (₹)</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {categories.map((cat: any) => (
                    <tr key={cat.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-3 font-medium text-foreground">{cat.label}</td>
                      <td className="p-3 text-center"><span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-md text-xs font-bold">{cat.min_pct}%</span></td>
                      <td className="p-3 text-center"><span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-md text-xs font-bold">{cat.max_pct}%</span></td>
                      <td className="p-3 text-center font-bold text-amber-600">₹{cat.fine_amount}</td>
                      <td className="p-3 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setEditingCat(cat); setCatForm({ label: cat.label, minPct: String(cat.min_pct), maxPct: String(cat.max_pct), amount: String(cat.fine_amount) }); setCatError(null); setShowCatModal(true); }}
                          className="p-2 rounded-xl bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <th className="p-4 font-semibold text-right">Actions</th>
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
