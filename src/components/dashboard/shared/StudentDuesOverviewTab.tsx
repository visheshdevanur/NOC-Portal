import { useState, useEffect } from 'react';
import { Eye, Search, FileDown, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isFirstYearSem } from '../../../lib/api';

interface StudentDuesOverviewTabProps {
  departmentId?: string;
  role: 'hod' | 'fyc' | 'staff' | 'clerk' | 'admin';
}

export default function StudentDuesOverviewTab({ departmentId, role }: StudentDuesOverviewTabProps) {
  const [studentDuesOverview, setStudentDuesOverview] = useState<any[]>([]);
  const [studentDuesLoading, setStudentDuesLoading] = useState(false);
  const [studentDuesSearch, setStudentDuesSearch] = useState('');
  const [semestersList, setSemestersList] = useState<any[]>([]);
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSemesters();
    fetchStudentDuesOverview();
  }, [departmentId, role]);

  const fetchSemesters = async () => {
    try {
      let query = supabase.from('semesters').select('*').order('name');
      if (departmentId) query = query.eq('department_id', departmentId);
      const { data } = await query;
      let filtered = data || [];
      if (role === 'admin') {
        // Admin sees all semesters
      } else if (role === 'staff' || role === 'hod') {
        filtered = filtered.filter(s => !isFirstYearSem(s.name));
      } else if (role === 'clerk' || role === 'fyc') {
        filtered = filtered.filter(s => isFirstYearSem(s.name));
      }
      setSemestersList(filtered);
    } catch (err) { console.error(err); }
  };

  const fetchStudentDuesOverview = async () => {
    setStudentDuesLoading(true);
    try {
      // 1. Get semester IDs to filter server-side (avoids 1000-row limit)
      const { data: allSems } = await supabase.from('semesters').select('id, name');
      const relevantSemIds = (allSems || []).filter(s => {
        if (role === 'admin') return true;
        if (role === 'staff' || role === 'hod') return !isFirstYearSem(s.name);
        if (role === 'clerk' || role === 'fyc') return isFirstYearSem(s.name);
        return true;
      }).map(s => s.id);

      if (relevantSemIds.length === 0) { setStudentDuesOverview([]); setStudentDuesLoading(false); return; }

      // 2. Paginate students filtered by relevant semesters
      let students: any[] = [];
      let offset = 0;
      const baseQuery = () => {
        let q = supabase.from('profiles')
          .select('id, full_name, roll_number, section, semester_id, semesters(name)')
          .eq('role', 'student')
          .in('semester_id', relevantSemIds)
          .order('full_name');
        if (departmentId) q = q.eq('department_id', departmentId);
        return q;
      };
      while (true) {
        const { data, error } = await baseQuery().range(offset, offset + 999);
        if (error) throw error;
        students = [...students, ...(data || [])];
        if (!data || data.length < 1000) break;
        offset += 1000;
      }

      const studentIds = students.map((s: any) => s.id);
      if (studentIds.length === 0) { setStudentDuesOverview([]); setStudentDuesLoading(false); return; }

      // 3. Fetch all dues in parallel (much faster than sequential)
      // Batch IN queries if > 1000 IDs
      const batchIn = async (table: string, select: string, ids: string[]) => {
        const results: any[] = [];
        for (let i = 0; i < ids.length; i += 500) {
          const batch = ids.slice(i, i + 500);
          // Paginate within each batch to avoid Supabase 1000-row default limit
          let offset = 0;
          while (true) {
            const { data } = await supabase.from(table).select(select).in('student_id', batch).range(offset, offset + 999);
            results.push(...(data || []));
            if (!data || data.length < 1000) break;
            offset += 1000;
          }
        }
        return results;
      };

      const [libDues, collegeDues, attendanceData] = await Promise.all([
        batchIn('library_dues', 'student_id, has_dues, fine_amount, paid_amount, remarks, permitted', studentIds),
        batchIn('student_dues', 'student_id, fine_amount, status, paid_amount, permitted_until', studentIds),
        batchIn('subject_enrollment', 'student_id, attendance_fee, attendance_fee_verified', studentIds),
      ]);

      const libMap = new Map((libDues || []).map((d: any) => [d.student_id, d]));
      const colMap = new Map((collegeDues || []).map((d: any) => [d.student_id, d]));
      const attMapUnpaid = new Map();
      const attMapPaid = new Map();
      
      (attendanceData || []).forEach((d: any) => {
        const fee = Number(d.attendance_fee) || 0;
        if (fee > 0) {
          if (d.attendance_fee_verified) {
            attMapPaid.set(d.student_id, (attMapPaid.get(d.student_id) || 0) + fee);
          } else {
            attMapUnpaid.set(d.student_id, (attMapUnpaid.get(d.student_id) || 0) + fee);
          }
        }
      });

      const combined = students.map((s: any) => ({
        ...s,
        library: libMap.get(s.id) || null,
        college: colMap.get(s.id) || null,
        attendance_fine_unpaid: attMapUnpaid.get(s.id) || 0,
        attendance_fine_paid: attMapPaid.get(s.id) || 0,
      }));

      setStudentDuesOverview(combined);
    } catch (err: any) {
      console.error('Failed to fetch student dues overview:', err);
    } finally {
      setStudentDuesLoading(false);
    }
  };

  const filteredStudentDuesOverview = studentDuesOverview.filter(s => {
    if (!studentDuesSearch) return true;
    const q = studentDuesSearch.toLowerCase();
    return s.full_name?.toLowerCase().includes(q) ||
      s.roll_number?.toLowerCase().includes(q) ||
      s.section?.toLowerCase().includes(q);
  });

  const downloadCSV = () => {
    const dataToExport = filteredStudentDuesOverview;
    if (!dataToExport || dataToExport.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Roll No,Student Name,Section,Semester,Library Dues,College Fee Status,Pending Attendance Fine,Paid Attendance Fine\n";
    
    dataToExport.forEach(item => {
      const roll = item.roll_number || 'N/A';
      const name = `"${(item.full_name || '').replace(/"/g, '""')}"`;
      const section = item.section || 'N/A';
      const semester = item.semesters?.name || 'N/A';
      const libDues = (!item.library || item.library.has_dues !== false) ? 'Pending' : 'Clear';
      const colStatus = (!item.college || item.college.status !== 'completed') ? 'Pending' : 'Clear';
      const attFineUnpaid = item.attendance_fine_unpaid || 0;
      const attFinePaid = item.attendance_fine_paid || 0;
      
      csvContent += `${roll},${name},${section},${semester},${libDues},${colStatus},${attFineUnpaid},${attFinePaid}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `student_dues_overview.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group by semester → section
  const grouped: Record<string, Record<string, any[]>> = {};
  for (const s of filteredStudentDuesOverview) {
    const sem = s.semesters?.name || 'Unassigned Semester';
    const sec = s.section || 'Unassigned Section';
    if (!grouped[sem]) grouped[sem] = {};
    if (!grouped[sem][sec]) grouped[sem][sec] = [];
    grouped[sem][sec].push(s);
  }

  const renderStudentRow = (s: any, idx: number) => {
    const libRecord = s.library;
    const libStatus = !libRecord ? 'pending' : (libRecord.has_dues === false ? 'clear' : (libRecord.permitted ? 'permitted' : 'pending'));
    const colRecord = s.college;
    const colIsPermitted = colRecord?.permitted_until && new Date(colRecord.permitted_until) > new Date();
    const colStatus = !colRecord ? 'pending' : (colRecord.status === 'completed' ? 'clear' : (colIsPermitted ? 'permitted' : 'pending'));
    const attFineUnpaid = Number(s.attendance_fine_unpaid) || 0;
    const attFinePaid = Number(s.attendance_fine_paid) || 0;

    return (
      <tr key={s.id} className="hover:bg-secondary/10 transition-colors bg-background">
        <td className="p-3 text-sm text-muted-foreground">{idx + 1}</td>
        <td className="p-3 font-medium text-foreground">{s.full_name}</td>
        <td className="p-3 text-muted-foreground font-mono text-sm">{s.roll_number || '—'}</td>
        <td className="p-3 text-center">
          {libStatus === 'pending' ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400">Pending</span>
          ) : libStatus === 'permitted' ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-violet-500/15 text-violet-600 dark:text-violet-400">Permitted</span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Clear</span>
          )}
        </td>
        <td className="p-3 text-center">
          {colStatus === 'pending' ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400">Pending</span>
          ) : colStatus === 'permitted' ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-violet-500/15 text-violet-600 dark:text-violet-400">Permitted</span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Clear</span>
          )}
        </td>
        <td className="p-3 font-bold text-sm">
          {attFineUnpaid > 0 ? (
            <span className="text-amber-600 dark:text-amber-400">₹{attFineUnpaid} (Pending)</span>
          ) : attFinePaid > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">₹{attFinePaid} (Paid)</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-1">
          <Eye className="w-5 h-5 text-indigo-500" />
          Student Dues Overview
        </h2>
        <p className="text-muted-foreground text-sm">
          View library dues, college fee remarks, and payment status for all department students (read-only).
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by student, roll no..."
            value={studentDuesSearch}
            onChange={(e) => setStudentDuesSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          />
        </div>
        
        <button
          onClick={downloadCSV}
          disabled={filteredStudentDuesOverview.length === 0}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white rounded-xl text-sm font-bold transition-all whitespace-nowrap"
        >
          <FileDown className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Summary Stats */}
      {!studentDuesLoading && studentDuesOverview.length > 0 && (() => {
        const libPending = studentDuesOverview.filter(s => !s.library || s.library.has_dues !== false).length;
        const colPending = studentDuesOverview.filter(s => !s.college || s.college.status !== 'completed').length;
        const totalStudents = studentDuesOverview.length;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground mb-1">Total Students</p>
              <p className="text-2xl font-bold text-foreground">{totalStudents}</p>
            </div>
            <div className="bg-card border border-orange-500/20 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1">Library Dues Pending</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{libPending}</p>
            </div>
            <div className="bg-card border border-red-500/20 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">College Fee Pending</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{colPending}</p>
            </div>
          </div>
        );
      })()}

      {/* Hierarchical View: Semester → Section → Students */}
      {studentDuesLoading ? (
        <div className="p-8 text-center text-muted-foreground animate-pulse bg-card rounded-3xl shadow-sm border border-border">Loading student dues overview...</div>
      ) : filteredStudentDuesOverview.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center bg-card rounded-3xl shadow-sm border border-border">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
            <Eye className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No Students Found</h3>
          <p className="text-muted-foreground mt-2 text-sm">No students match your search criteria.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .map(([sem, sections]) => {
              const totalInSem = Object.values(sections).reduce((acc, s) => acc + s.length, 0);
              const semKey = `dues_${sem}`;
              const isExpanded = expandedSems.has(semKey);
              return (
                <div key={semKey} className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                  <button
                    onClick={() => {
                      const next = new Set(expandedSems);
                      if (next.has(semKey)) next.delete(semKey); else next.add(semKey);
                      setExpandedSems(next);
                    }}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      <div>
                        <h3 className="text-lg font-bold text-foreground">{sem}</h3>
                        <p className="text-sm text-muted-foreground">{totalInSem} students</p>
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-4">
                      {Object.entries(sections)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([sec, items]) => (
                          <div key={sec}>
                            <h4 className="font-bold text-foreground bg-secondary/50 px-4 py-2 rounded-t-xl">Section: {sec} <span className="text-xs font-medium text-muted-foreground ml-2">({items.length} students)</span></h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-background text-foreground text-sm border-b border-border">
                                    <th className="p-3 font-semibold">#</th>
                                    <th className="p-3 font-semibold">Student Name</th>
                                    <th className="p-3 font-semibold">Roll No</th>
                                    <th className="p-3 font-semibold text-center">Library Dues</th>
                                    <th className="p-3 font-semibold text-center">College Fee Status</th>
                                    <th className="p-3 font-semibold">Attendance Fines (₹)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {items.map((s: any, idx: number) => renderStudentRow(s, idx))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {!studentDuesLoading && filteredStudentDuesOverview.length > 0 && (
        <div className="px-4 py-3 bg-card border border-border rounded-xl text-sm text-muted-foreground">
          Showing {filteredStudentDuesOverview.length} of {studentDuesOverview.length} student{studentDuesOverview.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
