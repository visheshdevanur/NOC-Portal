import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/useAuth';
import { Search, ChevronRight, ChevronDown, Globe, Users, Activity, X, CheckCircle2, Upload, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

type OEStudent = {
  id: string;
  student_id: string;
  subject_id: string;
  teacher_id: string | null;
  attendance_pct: number | null;
  assignment_status: string | null;
  attendance_fee: number | null;
  attendance_fee_verified: boolean | null;
  updated_at: string | null;
  last_updated_by_name: string | null;
  profiles: { full_name: string; roll_number: string | null; section: string | null; semester_id: string | null; department_id: string | null; departments?: { name: string } | null; semesters?: { name: string } | null } | null;
  subjects: { subject_name: string; subject_code: string; subject_type: string | null; department_id: string | null } | null;
};

type OELog = {
  id: string;
  action: string;
  actor_name: string | null;
  student_name: string | null;
  subject_name: string | null;
  old_value: string | null;
  new_value: string | null;
  details: string | null;
  created_at: string;
};

type FineCategory = {
  id: string;
  department_id: string;
  label: string;
  min_pct: number;
  max_pct: number;
  fine_amount: number;
  is_first_year: boolean;
};

type Props = {
  /** If provided, only show subjects assigned to this teacher */
  teacherId?: string;
};

export default function OEDashboard({ teacherId }: Props) {
  const { profile } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'students' | 'logs'>('students');
  const [oeStudents, setOEStudents] = useState<OEStudent[]>([]);
  const [oeLogs, setOELogs] = useState<OELog[]>([]);
  const [fineCategories, setFineCategories] = useState<FineCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());
  const [expandedSecs, setExpandedSecs] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState('');
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterSem, setFilterSem] = useState<string>('all');
  const [filterSection, setFilterSection] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Upload state
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchOEData = async () => {
    setLoading(true);
    try {
      // Try with last_updated_by_name first, fall back without it
      let query = supabase
        .from('subject_enrollment')
        .select('id, student_id, subject_id, teacher_id, attendance_pct, assignment_status, attendance_fee, attendance_fee_verified, updated_at, profiles!subject_enrollment_student_id_fkey(full_name, roll_number, section, semester_id, department_id, departments!profiles_department_id_fkey(name), semesters(name)), subjects!inner(subject_name, subject_code, subject_type, department_id)')
        .eq('subjects.subject_type', 'open_elective');

      if (teacherId) {
        query = query.eq('teacher_id', teacherId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOEStudents((data || []) as unknown as OEStudent[]);
    } catch (err) { console.error('OE fetch error:', err); }
    setLoading(false);
  };

  const fetchLogs = async () => {
    try {
      let query = supabase
        .from('oe_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      const { data, error } = await query;
      if (error) throw error;
      setOELogs(data || []);
    } catch (err) { console.error('OE logs error:', err); }
  };

  const fetchFineCategories = async () => {
    try {
      const { data } = await supabase.from('attendance_fine_categories').select('*');
      setFineCategories(data || []);
    } catch (err) { console.error('Fine categories error:', err); }
  };

  useEffect(() => { fetchOEData(); fetchLogs(); fetchFineCategories(); }, [teacherId]);

  /** Lookup fine amount from admin-created categories */
  const getFineAmount = (pct: number, departmentId: string | null): number => {
    if (!departmentId) return 0;
    const cats = fineCategories.filter(c => c.department_id === departmentId);
    for (const cat of cats) {
      if (pct >= cat.min_pct && pct <= cat.max_pct) {
        return cat.fine_amount;
      }
    }
    return 0;
  };

  const handleSaveAttendance = async (enrollmentId: string) => {
    setSaving(true);
    try {
      const pct = parseFloat(editPct);
      if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('Invalid percentage');

      const student = oeStudents.find(s => s.id === enrollmentId);
      const oldPct = student?.attendance_pct;
      const deptId = student?.profiles?.department_id || student?.subjects?.department_id || null;

      // Compute fine from admin categories
      const fineAmount = getFineAmount(pct, deptId);

      const { error } = await supabase.from('subject_enrollment').update({
        attendance_pct: pct,
        attendance_fee: fineAmount > 0 ? fineAmount : null,
        last_updated_by_name: profile?.full_name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', enrollmentId);
      if (error) throw error;

      // Log the change
      await supabase.from('oe_logs').insert({
        action: 'attendance_edit',
        actor_id: profile?.id,
        actor_name: profile?.full_name,
        student_id: student?.student_id,
        student_name: student?.profiles?.full_name,
        subject_id: student?.subject_id,
        subject_name: student?.subjects?.subject_name,
        old_value: String(oldPct ?? '—'),
        new_value: String(pct) + '%' + (fineAmount > 0 ? ` (Fine: ₹${fineAmount})` : ''),
        tenant_id: profile?.tenant_id,
      }).then(() => {});

      setEditingId(null);
      fetchOEData();
      fetchLogs();
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  };

  const handleToggleAssignment = async (enrollmentId: string) => {
    const student = oeStudents.find(s => s.id === enrollmentId);
    if (!student) return;
    const newStatus = student.assignment_status === 'pending' ? 'submitted' : 'pending';
    try {
      const { error } = await supabase.from('subject_enrollment').update({
        assignment_status: newStatus,
        last_updated_by_name: profile?.full_name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', enrollmentId);
      if (error) throw error;

      // Log the change
      await supabase.from('oe_logs').insert({
        action: 'status_change',
        actor_id: profile?.id,
        actor_name: profile?.full_name,
        student_id: student.student_id,
        student_name: student.profiles?.full_name,
        subject_id: student.subject_id,
        subject_name: student.subjects?.subject_name,
        old_value: student.assignment_status || 'pending',
        new_value: newStatus,
        tenant_id: profile?.tenant_id,
      }).then(() => {});

      fetchOEData();
      fetchLogs();
    } catch (err) { console.error(err); }
  };

  /** Upload Excel attendance (same format as Student Clearance) */
  const handleAttendanceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // The institute template has multi-row headers (dept name, semester info, etc.)
      // We need to find the actual header row that contains 'USN' and 'Overall'
      const allRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 }) as any[];
      
      // Find the header row index (row containing 'USN')
      let headerRowIdx = -1;
      let usnColIdx = -1;
      let attendanceColIdx = -1;
      
      for (let i = 0; i < Math.min(allRows.length, 15); i++) {
        const row = allRows[i];
        if (!Array.isArray(row)) continue;
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j]).toLowerCase().trim();
          if (cell === 'usn' || cell.includes('usn')) {
            headerRowIdx = i;
            usnColIdx = j;
            break;
          }
        }
        if (headerRowIdx >= 0) break;
      }
      
      if (headerRowIdx < 0 || usnColIdx < 0) {
        setUploadMsg('❌ No USN column found in the Excel. Expected a column header "USN".');
        setUploading(false);
        return;
      }
      
      // Find the attendance column (Overall) in the header row
      const headerRow = allRows[headerRowIdx] as any[];
      for (let j = 0; j < headerRow.length; j++) {
        const cell = String(headerRow[j]).toLowerCase().trim();
        if (cell.includes('overall') || cell.includes('attendance') || cell.includes('percentage') || cell.includes('pct')) {
          attendanceColIdx = j;
          break;
        }
      }
      
      if (attendanceColIdx < 0) {
        setUploadMsg('❌ No attendance percentage column found. Expected: "Overall", "Attendance %".');
        setUploading(false);
        return;
      }
      
      // Data rows start after header
      const dataRows = allRows.slice(headerRowIdx + 1);
      
      let updated = 0, skipped = 0, fined = 0;

      for (const row of dataRows) {
        if (!Array.isArray(row)) { skipped++; continue; }
        const usn = String(row[usnColIdx] || '').trim();
        if (!usn || usn.toLowerCase() === 'usn') { skipped++; continue; }

        // Read attendance percentage directly
        const attendanceVal = parseFloat(String(row[attendanceColIdx] || '').replace('%', '').trim());

        // Find matching student enrollment
        const match = oeStudents.find(s =>
          s.profiles?.roll_number?.toLowerCase() === usn.toLowerCase()
        );
        if (!match) { skipped++; continue; }

        const updateData: any = {
          last_updated_by_name: profile?.full_name || null,
          updated_at: new Date().toISOString(),
        };

        if (!isNaN(attendanceVal) && attendanceVal >= 0 && attendanceVal <= 100) {
          updateData.attendance_pct = attendanceVal;
          const deptId = match.profiles?.department_id || match.subjects?.department_id || null;
          const fineAmount = getFineAmount(attendanceVal, deptId);
          if (fineAmount > 0) {
            updateData.attendance_fee = fineAmount;
            fined++;
          }
        }

        await supabase.from('subject_enrollment').update(updateData).eq('id', match.id);
        updated++;
      }

      // Log the upload
      await supabase.from('oe_logs').insert({
        action: 'bulk_upload',
        actor_id: profile?.id,
        actor_name: profile?.full_name,
        details: `Uploaded ${file.name}: ${updated} updated, ${skipped} skipped, ${fined} fined`,
        tenant_id: profile?.tenant_id,
      }).then(() => {});

      setUploadMsg(`✅ ${updated} updated, ${skipped} skipped${fined > 0 ? `, ${fined} auto-fined` : ''}`);
      fetchOEData();
      fetchLogs();
    } catch (err: any) {
      setUploadMsg(`❌ Error: ${err.message}`);
    }
    setUploading(false);
    e.target.value = '';
  };

  /** Relative time helper */
  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Extract unique values for filters
  const allBranches = useMemo(() => Array.from(new Set(oeStudents.map(s => s.profiles?.departments?.name || 'Unknown'))).sort(), [oeStudents]);
  const allSems = useMemo(() => Array.from(new Set(oeStudents.map(s => s.profiles?.semesters?.name || 'Unknown'))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [oeStudents]);
  const allSections = useMemo(() => Array.from(new Set(oeStudents.map(s => s.profiles?.section || 'Unknown'))).sort(), [oeStudents]);

  // Group: Branch → Semester → Section → Students
  const grouped = useMemo(() => {
    const filtered = oeStudents.filter(s => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!(s.profiles?.full_name?.toLowerCase().includes(term) || s.profiles?.roll_number?.toLowerCase().includes(term) || s.subjects?.subject_name?.toLowerCase().includes(term))) return false;
      }
      if (filterBranch !== 'all' && (s.profiles?.departments?.name || 'Unknown') !== filterBranch) return false;
      if (filterSem !== 'all' && (s.profiles?.semesters?.name || 'Unknown') !== filterSem) return false;
      if (filterSection !== 'all' && (s.profiles?.section || 'Unknown') !== filterSection) return false;
      if (filterStatus === 'submitted' && s.assignment_status !== 'submitted') return false;
      if (filterStatus === 'pending' && s.assignment_status !== 'pending') return false;
      if (filterStatus === 'not_uploaded' && s.attendance_pct !== null) return false;
      return true;
    });

    const result: Record<string, Record<string, Record<string, OEStudent[]>>> = {};
    filtered.forEach(s => {
      const branch = s.profiles?.departments?.name || 'Unknown Branch';
      const sem = s.profiles?.semesters?.name || 'Unknown Semester';
      const sec = s.profiles?.section || 'Unknown';
      if (!result[branch]) result[branch] = {};
      if (!result[branch][sem]) result[branch][sem] = {};
      if (!result[branch][sem][sec]) result[branch][sem][sec] = [];
      result[branch][sem][sec].push(s);
    });
    return result;
  }, [oeStudents, searchTerm, filterBranch, filterSem, filterSection, filterStatus]);

  const toggleBranch = (b: string) => {
    const next = new Set(expandedBranches);
    next.has(b) ? next.delete(b) : next.add(b);
    setExpandedBranches(next);
  };

  const toggleSem = (key: string) => {
    const next = new Set(expandedSems);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpandedSems(next);
  };

  const toggleSec = (key: string) => {
    const next = new Set(expandedSecs);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpandedSecs(next);
  };

  /** Count helpers for badges */
  const countPending = (students: OEStudent[]) => students.filter(s => s.assignment_status === 'pending' || !s.assignment_status).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Globe className="w-6 h-6 text-violet-500" />
              {teacherId ? 'OE Attendance' : 'Open Elective Dashboard'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {teacherId ? 'Upload and manage attendance for your Open Elective students.' : 'Manage OE student attendance across all branches and semesters.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-4 py-2 bg-violet-500/10 text-violet-600 rounded-xl text-sm font-bold">{oeStudents.length} OE Students</span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 mt-6">
          <button onClick={() => setActiveSubTab('students')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${activeSubTab === 'students' ? 'bg-violet-500 text-white shadow-md' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            <Users className="w-4 h-4" /> Students
          </button>
          <button onClick={() => setActiveSubTab('logs')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${activeSubTab === 'logs' ? 'bg-violet-500 text-white shadow-md' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            <Activity className="w-4 h-4" /> Logs
          </button>
        </div>
      </div>

      {/* Students Tab */}
      {activeSubTab === 'students' && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          {/* Search + Filters + Upload */}
          <div className="p-5 border-b border-border space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Search students, subjects..." className="pl-10 pr-4 py-3 bg-background border border-border rounded-xl w-full focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              {/* Upload button */}
              <label className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors border cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30'}`}>
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Upload Excel'}
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleAttendanceUpload} disabled={uploading} />
              </label>
              {uploadMsg && (
                <span className={`text-xs font-medium ${uploadMsg.startsWith('❌') ? 'text-destructive' : 'text-emerald-600'}`}>
                  {uploadMsg}
                </span>
              )}
            </div>
            {/* Filter row */}
            <div className="flex flex-wrap gap-3">
              <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="px-3 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="all">All Branches</option>
                {allBranches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={filterSem} onChange={e => setFilterSem(e.target.value)} className="px-3 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="all">All Semesters</option>
                {allSems.map(s => <option key={s} value={s}>Sem {s}</option>)}
              </select>
              <select value={filterSection} onChange={e => setFilterSection(e.target.value)} className="px-3 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="all">All Sections</option>
                {allSections.map(s => <option key={s} value={s}>Section {s}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="all">All Status</option>
                <option value="submitted">Submitted</option>
                <option value="pending">Pending</option>
                <option value="not_uploaded">Not Uploaded</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading OE students...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No Open Elective subjects yet.</p>
              <p className="text-xs mt-1">These will appear here once a DEO creates one.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([branch, sems]) => {
                const branchTotal = Object.values(sems).reduce((t, secs) => t + Object.values(secs).reduce((t2, arr) => t2 + arr.length, 0), 0);
                const branchPending = Object.values(sems).reduce((t, secs) => t + Object.values(secs).reduce((t2, arr) => t2 + countPending(arr), 0), 0);
                return (
                  <div key={branch}>
                    <button onClick={() => toggleBranch(branch)} className="w-full flex items-center gap-3 p-5 text-left hover:bg-secondary/20 transition-colors">
                      {expandedBranches.has(branch) ? <ChevronDown className="w-5 h-5 text-violet-500" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      <h3 className="text-lg font-bold text-foreground">{branch}</h3>
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
                        {branchTotal} students
                        {branchPending > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold">{branchPending} pending</span>}
                      </span>
                    </button>
                    {expandedBranches.has(branch) && (
                      <div className="pl-6 pb-4 space-y-2">
                        {Object.entries(sems).sort(([a],[b]) => a.localeCompare(b, undefined, {numeric: true})).map(([sem, sections]) => {
                          const semKey = `${branch}-${sem}`;
                          const semTotal = Object.values(sections).reduce((t, arr) => t + arr.length, 0);
                          const semPending = Object.values(sections).reduce((t, arr) => t + countPending(arr), 0);
                          return (
                            <div key={semKey} className="border border-border rounded-xl overflow-hidden ml-4">
                              <button onClick={() => toggleSem(semKey)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/10 transition-colors">
                                {expandedSems.has(semKey) ? <ChevronDown className="w-4 h-4 text-violet-500" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                <span className="font-bold text-foreground">Sem {sem}</span>
                                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
                                  {semTotal} students
                                  {semPending > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold">{semPending} pending</span>}
                                </span>
                              </button>
                              {expandedSems.has(semKey) && (
                                <div className="border-t border-border">
                                  {Object.entries(sections).sort(([a],[b]) => a.localeCompare(b)).map(([sec, students]) => {
                                    const secKey = `${semKey}-${sec}`;
                                    const secPending = countPending(students);
                                    return (
                                      <div key={sec}>
                                        <button onClick={() => toggleSec(secKey)} className="w-full flex items-center gap-2 px-5 py-2.5 bg-secondary/30 text-sm font-bold text-foreground hover:bg-secondary/50 transition-colors">
                                          {expandedSecs.has(secKey) ? <ChevronDown className="w-3.5 h-3.5 text-violet-500" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                          Section {sec} ({students.length})
                                          {secPending > 0 && <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold text-xs">{secPending} pending</span>}
                                        </button>
                                        {expandedSecs.has(secKey) && (
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                              <thead>
                                                <tr className="bg-background text-xs border-b border-border">
                                                  <th className="p-3 font-semibold">#</th>
                                                  <th className="p-3 font-semibold">USN</th>
                                                  <th className="p-3 font-semibold">Student</th>
                                                  <th className="p-3 font-semibold">OE Subject</th>
                                                  <th className="p-3 font-semibold text-center">Attendance %</th>
                                                  <th className="p-3 font-semibold text-center">Status</th>
                                                  <th className="p-3 font-semibold text-center">Fine</th>
                                                  <th className="p-3 font-semibold">Last Updated By</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-border">
                                                {students.map((s, idx) => (
                                                  <tr key={s.id} className="hover:bg-secondary/10">
                                                    <td className="p-3 text-sm text-muted-foreground">{idx+1}</td>
                                                    <td className="p-3 text-xs font-mono text-muted-foreground">{s.profiles?.roll_number || '—'}</td>
                                                    <td className="p-3 font-medium text-sm">{s.profiles?.full_name}</td>
                                                    <td className="p-3 text-xs text-muted-foreground">{s.subjects?.subject_code} — {s.subjects?.subject_name}</td>
                                                    {/* Attendance — editable */}
                                                    <td className="p-3 text-center">
                                                      {editingId === s.id ? (
                                                        <div className="flex items-center gap-1 justify-center">
                                                          <input type="number" min="0" max="100" step="0.1" value={editPct} onChange={e => setEditPct(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveAttendance(s.id); if (e.key === 'Escape') setEditingId(null); }}
                                                            className="w-16 px-2 py-1 text-sm bg-background border border-border rounded-lg text-center" autoFocus />
                                                          <button onClick={() => handleSaveAttendance(s.id)} disabled={saving} className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                                                          <button onClick={() => setEditingId(null)} className="p-1 rounded bg-secondary hover:bg-secondary/80"><X className="w-3.5 h-3.5" /></button>
                                                        </div>
                                                      ) : (
                                                        <button onClick={() => { setEditingId(s.id); setEditPct(String(s.attendance_pct ?? '')); }}
                                                          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                                                            s.attendance_pct === null ? 'bg-secondary text-muted-foreground' :
                                                            (s.attendance_pct ?? 0) < 85 ? 'bg-red-500/15 text-red-600 hover:bg-red-500/30' :
                                                            'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/30'
                                                          }`}>
                                                          {s.attendance_pct === null ? '—' : `${s.attendance_pct}%`}
                                                        </button>
                                                      )}
                                                    </td>
                                                    {/* Assignment Status — toggle */}
                                                    <td className="p-3 text-center">
                                                      {s.attendance_pct === null ? (
                                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-secondary text-muted-foreground">Not uploaded</span>
                                                      ) : (
                                                        <button onClick={() => handleToggleAssignment(s.id)}
                                                          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                                                            s.assignment_status === 'pending' || !s.assignment_status
                                                              ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500 hover:text-white'
                                                              : 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                                                          }`}>
                                                          {s.assignment_status === 'pending' || !s.assignment_status ? 'Pending' : 'Submitted'}
                                                        </button>
                                                      )}
                                                    </td>
                                                    {/* Fine */}
                                                    <td className="p-3 text-center">
                                                      {s.attendance_fee && s.attendance_fee > 0 ? (
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.attendance_fee_verified ? 'bg-emerald-500/10 text-emerald-600 line-through' : 'bg-red-500/10 text-red-600'}`}>
                                                          <AlertTriangle className="w-3 h-3 inline mr-0.5" />₹{s.attendance_fee}
                                                        </span>
                                                      ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                      )}
                                                    </td>
                                                    {/* Last updated by */}
                                                    <td className="p-3 text-xs text-muted-foreground">
                                                      {s.last_updated_by_name ? (
                                                        <div>
                                                          <span className="font-medium text-foreground">{s.last_updated_by_name}</span>
                                                          {s.updated_at && <span className="ml-1 opacity-70">{timeAgo(s.updated_at)}</span>}
                                                        </div>
                                                      ) : '—'}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeSubTab === 'logs' && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><Activity className="w-5 h-5 text-violet-500" /> OE Activity Logs</h3>
          </div>
          {oeLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No OE activity logs yet.</div>
          ) : (
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {oeLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-secondary/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold mr-2 ${
                        log.action === 'bulk_upload' ? 'bg-blue-500/10 text-blue-600' :
                        log.action === 'status_change' ? 'bg-amber-500/10 text-amber-600' :
                        'bg-violet-500/10 text-violet-600'
                      }`}>{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-sm text-foreground font-medium">{log.actor_name || 'System'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  {log.details && <p className="text-sm text-muted-foreground mt-1">{log.details}</p>}
                  {log.student_name && <p className="text-xs text-muted-foreground mt-0.5">Student: {log.student_name} | Subject: {log.subject_name || '—'}</p>}
                  {log.old_value && <p className="text-xs text-muted-foreground">Changed: {log.old_value} → {log.new_value}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
