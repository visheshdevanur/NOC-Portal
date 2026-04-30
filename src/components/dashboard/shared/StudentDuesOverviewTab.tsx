import { useState, useEffect } from 'react';
import { Eye, Search, FileDown } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isFirstYearSem } from '../../../lib/api';

interface StudentDuesOverviewTabProps {
  departmentId?: string;
  role: 'hod' | 'fyc' | 'staff' | 'clerk';
}

export default function StudentDuesOverviewTab({ departmentId, role }: StudentDuesOverviewTabProps) {
  const [studentDuesOverview, setStudentDuesOverview] = useState<any[]>([]);
  const [studentDuesLoading, setStudentDuesLoading] = useState(false);
  const [studentDuesSearch, setStudentDuesSearch] = useState('');
  const [csvSemFilter, setCsvSemFilter] = useState('all');
  const [semestersList, setSemestersList] = useState<any[]>([]);

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
      if (role === 'staff' || role === 'hod') {
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
      let query = supabase
        .from('profiles')
        .select('id, full_name, roll_number, section, semester_id, semesters(name)')
        .eq('role', 'student')
        .order('full_name');
      if (departmentId) query = query.eq('department_id', departmentId);
      const { data: allStudents, error: studErr } = await query;
      if (studErr) throw studErr;

      const students = (allStudents || []).filter((s: any) => {
        const semName = s.semesters?.name;
        if (!semName) return true;
        if (role === 'staff' || role === 'hod') return !isFirstYearSem(semName);
        if (role === 'clerk' || role === 'fyc') return isFirstYearSem(semName);
        return true;
      });

      const studentIds = students.map((s: any) => s.id);
      if (studentIds.length === 0) { setStudentDuesOverview([]); setStudentDuesLoading(false); return; }

      const { data: libDues } = await supabase.from('library_dues').select('student_id, has_dues, fine_amount, paid_amount, remarks').in('student_id', studentIds);
      const { data: collegeDues } = await supabase.from('student_dues').select('student_id, fine_amount, status, paid_amount').in('student_id', studentIds);
      const { data: attendanceData } = await supabase.from('subject_enrollment').select('student_id, attendance_fee, attendance_fee_verified').in('student_id', studentIds);

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

  const filteredStudentDuesOverview = studentDuesOverview.filter(s =>
    s.full_name?.toLowerCase().includes(studentDuesSearch.toLowerCase()) ||
    s.roll_number?.toLowerCase().includes(studentDuesSearch.toLowerCase()) ||
    s.section?.toLowerCase().includes(studentDuesSearch.toLowerCase())
  ).filter(s => csvSemFilter === 'all' || s.semester_id === csvSemFilter);

  const downloadCSV = () => {
    const dataToExport = filteredStudentDuesOverview;
    if (!dataToExport || dataToExport.length === 0) return;
    
    const semName = csvSemFilter === 'all' ? 'all_semesters' : (semestersList.find(s => s.id === csvSemFilter)?.name || 'semester').replace(/\s+/g, '_');
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Roll No,Student Name,Section,Semester,Library Dues,College Fee Status,Pending Attendance Fine,Paid Attendance Fine\n";
    
    dataToExport.forEach(item => {
      const roll = item.roll_number || 'N/A';
      const name = `"${(item.full_name || '').replace(/"/g, '""')}"`;
      const section = item.section || 'N/A';
      const semester = item.semesters?.name || 'N/A';
      const libDues = item.library?.has_dues ? 'Pending' : 'Clear';
      const colStatus = item.college?.status === 'pending' ? 'Pending' : (item.college?.status === 'completed' ? 'Completed' : 'N/A');
      const attFineUnpaid = item.attendance_fine_unpaid || 0;
      const attFinePaid = item.attendance_fine_paid || 0;
      
      csvContent += `${roll},${name},${section},${semester},${libDues},${colStatus},${attFineUnpaid},${attFinePaid}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `student_dues_overview_${semName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        
        <div className="flex gap-3 w-full md:w-auto">
          <select
            value={csvSemFilter}
            onChange={(e) => setCsvSemFilter(e.target.value)}
            className="px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none w-full md:w-48"
          >
            <option value="all">All Semesters</option>
            {semestersList.map(sem => (
              <option key={sem.id} value={sem.id}>{sem.name}</option>
            ))}
          </select>
          <button
            onClick={downloadCSV}
            disabled={filteredStudentDuesOverview.length === 0}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white rounded-xl text-sm font-bold transition-all whitespace-nowrap"
          >
            <FileDown className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        {!studentDuesLoading && studentDuesOverview.length > 0 && (() => {
          const libPending = studentDuesOverview.filter(s => s.library?.has_dues).length;
          const colPending = studentDuesOverview.filter(s => s.college?.status === 'pending').length;
          const totalStudents = studentDuesOverview.length;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 border-b border-border bg-secondary/10">
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-secondary/40 text-foreground text-sm border-b border-border">
                <th className="p-4 font-semibold">#</th>
                <th className="p-4 font-semibold">Student Name</th>
                <th className="p-4 font-semibold">Roll No</th>
                <th className="p-4 font-semibold">Section</th>
                <th className="p-4 font-semibold">Semester</th>
                <th className="p-4 font-semibold text-center">Library Dues</th>
                <th className="p-4 font-semibold text-center">College Fee Status</th>
                <th className="p-4 font-semibold">Attendance Fines (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {studentDuesLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground animate-pulse">Loading student dues overview...</td></tr>
              ) : filteredStudentDuesOverview.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
                        <Eye className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <h3 className="text-lg font-bold text-foreground">No Students Found</h3>
                      <p className="text-muted-foreground mt-2 text-sm">No students match your search criteria.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStudentDuesOverview.map((s, idx) => {
                  const hasLibDues = s.library?.has_dues;
                  const colStatus = s.college?.status || 'N/A';
                  const attFineUnpaid = Number(s.attendance_fine_unpaid) || 0;
                  const attFinePaid = Number(s.attendance_fine_paid) || 0;

                  return (
                    <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-4 text-sm text-muted-foreground">{idx + 1}</td>
                      <td className="p-4 font-medium text-foreground">{s.full_name}</td>
                      <td className="p-4 text-muted-foreground font-mono text-sm">{s.roll_number || '—'}</td>
                      <td className="p-4 text-muted-foreground">{s.section || '—'}</td>
                      <td className="p-4 text-muted-foreground text-sm">{s.semesters?.name || '—'}</td>
                      <td className="p-4 text-center">
                        {hasLibDues ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Clear
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {colStatus === 'pending' ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400">
                            Pending
                          </span>
                        ) : colStatus === 'completed' ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Completed
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </td>
                      <td className="p-4 font-bold text-sm">
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
                })
              )}
            </tbody>
          </table>
        </div>
        {!studentDuesLoading && filteredStudentDuesOverview.length > 0 && (
          <div className="px-4 py-3 bg-secondary/30 border-t border-border text-sm text-muted-foreground">
            Showing {filteredStudentDuesOverview.length} of {studentDuesOverview.length} student{studentDuesOverview.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
