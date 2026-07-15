import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/useAuth';
import { getFacultyPendingStudents, markFacultySubjectStatus, batchMarkFacultyAttendance, getTeacherSubjectsList, getIAAttendanceForSubject, getTeacherIAAttendance, getAttendanceFreezeStatus, updateAssignmentStatus } from '../../lib/api';
import { Search, ClipboardList, BookOpen, ChevronDown, ChevronUp, ChevronRight, CheckCircle2, XCircle, Users, Download, Upload, FileSpreadsheet, Building2, Layers, RefreshCw, Snowflake, Globe } from 'lucide-react';
import { parseInstituteAttendanceSheet } from '../../lib/instituteAttendanceParser';
import OEDashboard from './shared/OEDashboard';

type SubjectEnrollment = {
  id: string;
  student_id: string;
  subject_id: string;
  teacher_id: string;
  status: string;
  attendance_pct: number | null;
  assignment_status: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  subjects: { subject_name: string; subject_code: string; department_id?: string; departments?: { name: string } | null };
  profiles: { full_name: string; roll_number?: string | null; section?: string | null; semester_id?: string | null; department_id?: string | null; semesters?: { name: string } | null; departments?: { name: string } | null } | null;
};

type TeacherSubject = {
  id: string;
  subject_name: string;
  subject_code: string;
  subject_type?: string | null;
  semester_id: string;
  department_id?: string;
  semesters: { name: string } | null;
  departments: { name: string } | null;
};

type IARecord = {
  id: string;
  student_id: string;
  subject_id: string;
  teacher_id: string;
  ia_number: number;
  is_present: boolean;
  profiles: { full_name: string; roll_number: string | null; section: string | null } | null;
};



export default function FacultyDashboard() {
  const { user, profile } = useAuth();
  // Tab state
  const [activeTab, setActiveTab] = useState<'clearance' | 'manage-ia' | 'assignments' | 'oe-attendance'>('clearance');

  // Attendance freeze state (set by admin in AttendanceFinesTab)
  const [attendanceFrozen, setAttendanceFrozen] = useState(false);

  // === Clearance Tab State (existing) ===
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [csvUploadMsg, setCsvUploadMsg] = useState<string | null>(null);

  // === Assignments Tab State ===
  const [asnDept, setAsnDept] = useState<string | null>(null);
  const [asnSem, setAsnSem] = useState<string | null>(null);
  const [asnSec, setAsnSec] = useState<string | null>(null);
  const [asnSubject, setAsnSubject] = useState<string | null>(null);
  const clearanceCsvRef = useRef<HTMLInputElement>(null);

  // Fetch freeze status on mount (when profile is available)
  useEffect(() => {
    if (!profile?.tenant_id) return;
    getAttendanceFreezeStatus(profile.tenant_id)
      .then(setAttendanceFrozen)
      .catch(console.error);
  }, [profile?.tenant_id]);

  // === Manage IAs Tab State ===
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [iaDeptFilter, setIaDeptFilter] = useState<string | null>(null);
  const [iaSemFilter, setIaSemFilter] = useState<string | null>(null);
  const [iaSectionFilter, setIaSectionFilter] = useState<string | null>(null);
  const [iaRecords, setIaRecords] = useState<IARecord[]>([]);
  const [iaLoading, setIaLoading] = useState(false);
  // For viewing existing IAs (read-only)
  const [expandedIA, setExpandedIA] = useState<number | null>(null);


  // React Query: primary data fetch with caching + deduplication
  const { data: facultyData, isLoading: loading, refetch: refetchData } = useQuery({
    queryKey: ['facultyClearance', user?.id],
    queryFn: async () => {
      // Step 1: Fetch students and subjects first
      const [data, subjects] = await Promise.all([
        getFacultyPendingStudents(user!.id),
        getTeacherSubjectsList(user!.id),
      ]);
      const students = data as unknown as SubjectEnrollment[];

      // Step 2: Fetch IA data with actual subject IDs from enrollments
      const subjectIds = [...new Set(students.map(s => s.subject_id).filter(Boolean))];
      const ias = subjectIds.length > 0 ? (await getTeacherIAAttendance(user!.id, subjectIds) || []) : [];

      // Step 3: Recalculate status/remarks for students that already have attendance_pct set
      // This ensures COE-uploaded IA data is reflected immediately
      const recalculated = students.map(s => {
        // Only recalculate if teacher has already set attendance
        if (s.attendance_pct == null || s.attendance_pct === undefined) return s;

        const pct = s.attendance_pct;
        const studentIAs = ias.filter((ia: any) => ia.subject_id === s.subject_id && ia.student_id === s.student_id && ia.is_present);
        const iaPresentCount = studentIAs.length;
        const attendanceOk = pct >= 85;
        const iaOk = iaPresentCount >= 2;
        const assignmentOk = s.assignment_status !== 'pending';

        let status: string;
        const issues: string[] = [];

        if (!attendanceOk) issues.push(`Low Attendance (${pct}% < 85%)`);
        if (!iaOk) issues.push(`Insufficient IA Attendance (${iaPresentCount}/2 required)`);
        if (!assignmentOk) issues.push('Assignment not submitted');

        if (issues.length === 0) {
          status = 'completed';
        } else {
          status = 'rejected';
        }
        const remarks = issues.join(' | ');

        // Only update if status actually changed
        if (status !== s.status || remarks !== (s.remarks || '')) {
          return { ...s, status, remarks };
        }
        return s;
      });

      return { students: recalculated, ias, subjects: subjects as TeacherSubject[] };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const [students, setStudents] = useState<SubjectEnrollment[]>([]);

  // Sync query data to local state (needed for local attendance edits)
  // Use facultyData as dependency — studentsFromQuery is a new array every render
  const [oeStudents, setOEStudents] = useState<SubjectEnrollment[]>([]);
  useEffect(() => {
    if (facultyData) {
      const allStudents = facultyData.students || [];
      const filtered = allStudents.filter(
        (s: any) => s.subjects?.subject_type !== 'open_elective'
      );
      const oeFiltered = allStudents.filter(
        (s: any) => s.subjects?.subject_type === 'open_elective'
      );
      setStudents(filtered);
      setOEStudents(oeFiltered);
      setTeacherSubjects(facultyData.subjects || []);
    }
  }, [facultyData]);

  const fetchData = () => { refetchData(); };

  // Load IA data when subject changes
  useEffect(() => {
    if (selectedSubjectId && user) {
      loadIAData(selectedSubjectId, iaSectionFilter);
    }
  }, [selectedSubjectId]);

  const loadIAData = async (subjectId: string, section?: string | null) => {
    if (!user) return;
    setIaLoading(true);
    try {
      const records = await getIAAttendanceForSubject(subjectId, user.id, section);
      setIaRecords(records as unknown as IARecord[]);
      setExpandedIA(null);
    } catch (err) {
      console.error('Error loading IA data:', err);
    } finally {
      setIaLoading(false);
    }
  };



  // ==================== CSV HELPERS ====================

  // Download attendance CSV template for the clearance tab
  const downloadAttendanceTemplate = () => {
    const templateStudents = selectedSubject
      ? filtered.filter(s => `${s.subjects.subject_code} — ${s.subjects.subject_name}` === selectedSubject)
      : filtered;
    const headers = ['roll_number', 'student_name', 'subject_code', 'subject_name', 'total_classes', 'attended_classes'];
    const rows = templateStudents.map(s => [
      s.profiles?.roll_number || '',
      s.profiles?.full_name || '',
      s.subjects.subject_code,
      s.subjects.subject_name,
      '', // total_classes — teacher fills this
      ''  // attended_classes — teacher fills this
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const semName = allSemesters.find(s => s.id === selectedSemester)?.name || 'All';
    const subjectCode = selectedSubject ? selectedSubject.split(' — ')[0] : 'All';
    downloadCSV(csvContent, `Attendance_${semName}_Section${selectedSection || 'All'}_${subjectCode}.csv`);
  };

  // Upload attendance % CSV
  const handleAttendanceCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Block upload when frozen
    if (attendanceFrozen) {
      setCsvUploadMsg('❄️ Attendance is currently frozen by the admin. Uploads are not allowed.');
      e.target.value = '';
      return;
    }
    setCsvUploadMsg('⏳ Uploading...');


    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        // Fetch IA data fresh from DB — query by subject_ids to include COE-uploaded records
        const subjectIds = [...new Set(students.map(s => s.subject_id).filter(Boolean))];
        const freshIAs = await getTeacherIAAttendance(user!.id, subjectIds) || [];

        const text = evt.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { setCsvUploadMsg('Error: CSV must have header + data rows.'); return; }

        const header = lines[0].toLowerCase().replace(/"/g, '').split(',').map(h => h.trim());
        const rollIdx = header.indexOf('roll_number');
        const codeIdx = header.indexOf('subject_code');
        // Support both old (attendance_pct) and new (total_classes + attended_classes)
        const pctIdx = header.indexOf('attendance_pct');
        const totalIdx = header.indexOf('total_classes');
        const attendedIdx = header.indexOf('attended_classes');

        if (rollIdx === -1) { setCsvUploadMsg('Error: CSV needs a "roll_number" column.'); return; }
        if (pctIdx === -1 && (totalIdx === -1 || attendedIdx === -1)) {
          setCsvUploadMsg('Error: CSV needs either "attendance_pct" OR both "total_classes" and "attended_classes" columns.');
          return;
        }

        // Build a lookup: roll+subjectCode -> enrollment record
        const enrollmentMap = new Map<string, SubjectEnrollment>();
        students.forEach(s => {
          const key = `${(s.profiles?.roll_number || '').toLowerCase().trim()}_${s.subjects.subject_code.toLowerCase().trim()}`;
          enrollmentMap.set(key, s);
        });

        // Parse all rows first
        const batchUpdates: { enrollmentId: string; status: string; attendancePct: number; remarks: string }[] = [];
        let parseErrors = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].replace(/"/g, '').split(',').map(c => c.trim());
          const roll = (cols[rollIdx] || '').toLowerCase().trim();
          const code = codeIdx !== -1 ? (cols[codeIdx] || '').toLowerCase().trim() : '';

          let enrollment: SubjectEnrollment | undefined;
          if (code) {
            enrollment = enrollmentMap.get(`${roll}_${code}`);
          } else {
            enrollment = filtered.find(s => (s.profiles?.roll_number || '').toLowerCase().trim() === roll);
          }

          if (!enrollment) { parseErrors++; continue; }

          // Calculate pct from class counts if provided, else use direct pct
          let pct: number;
          if (totalIdx !== -1 && attendedIdx !== -1) {
            const total = parseInt(cols[totalIdx] || '0');
            const attended = parseInt(cols[attendedIdx] || '0');
            if (isNaN(total) || isNaN(attended) || total <= 0) { parseErrors++; continue; }
            pct = Math.round((attended / total) * 100);
          } else {
            const rawPct = parseInt(cols[pctIdx] || '');
            if (isNaN(rawPct) || rawPct < 0 || rawPct > 100) { parseErrors++; continue; }
            pct = rawPct;
          }

          // Determine IA status using fresh DB data
          const subjectIAs = freshIAs.filter((ia: any) => ia.subject_id === enrollment?.subject_id);
          const iaPresentCount = subjectIAs.filter((ia: any) => ia.student_id === enrollment?.student_id && ia.is_present).length;

          const attendanceOk = pct >= 85;
          const iaOk = iaPresentCount >= 2;

          let status: string;
          let remarks: string;

          if (attendanceOk && iaOk) {
            status = 'completed'; remarks = '';
          } else if (!attendanceOk && !iaOk) {
            status = 'rejected'; remarks = `Low Attendance (<85%) & Insufficient IA Attendance (${iaPresentCount}/2 required)`;
          } else if (!attendanceOk) {
            status = 'rejected'; remarks = `Low Attendance (<85%)`;
          } else {
            status = 'rejected'; remarks = `Insufficient IA Attendance (${iaPresentCount}/2 required)`;
          }

          batchUpdates.push({ enrollmentId: enrollment.id, status, attendancePct: pct, remarks });
        }

        // Fast bulk update: 1 auth call, 50 parallel, 1 log entry
        const { updated, errors: dbErrors } = await batchMarkFacultyAttendance(batchUpdates);
        const totalErrors = parseErrors + dbErrors;
        setCsvUploadMsg(`✅ Updated ${updated} students.${totalErrors > 0 ? ` ${totalErrors} errors/unmatched.` : ''}`);
        await fetchData();
      } catch (err: any) {
        setCsvUploadMsg(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ─── Institute Excel template upload (.xlsx / .xls) ─────────────────────────
  // Handles the monthly attendance report exported from the college software.
  // Extracts: USN (→ roll_number), Total classes, Present classes, Subject code.
  // Everything else in the sheet (P/A date columns, %, header metadata) is ignored.
  const handleInstituteExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Block upload when frozen
    if (attendanceFrozen) {
      setCsvUploadMsg('❄️ Attendance is currently frozen by the admin. Uploads are not allowed.');
      e.target.value = '';
      return;
    }
    setCsvUploadMsg('⏳ Reading Excel file…');


    try {
      // Dynamically import SheetJS so it stays out of the main bundle
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      // header:1 → 2-D array; defval:'' → empty cells become '' not undefined
      const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: '',
        raw: true,   // keep numeric values as JS numbers (not formatted strings)
      });

      const parsed = parseInstituteAttendanceSheet(rows);

      // ── Fatal structural errors ──────────────────────────────────────────
      if (parsed.fatalErrors.length > 0) {
        setCsvUploadMsg(`❌ ${parsed.fatalErrors[0]}`);
        e.target.value = '';
        return;
      }

      if (parsed.rows.length === 0) {
        setCsvUploadMsg('❌ No student data found in the file.');
        e.target.value = '';
        return;
      }

      // ── Optional: warn if file subject doesn't match selected subject ───
      if (parsed.subjectCode && selectedSubject) {
        const selectedCode = selectedSubject.split(' — ')[0].toUpperCase().trim();
        if (parsed.subjectCode.toUpperCase() !== selectedCode) {
          setCsvUploadMsg(
            `⚠️ File subject code (${parsed.subjectCode}) doesn't match selected subject (${selectedCode}). Processing anyway…`,
          );
        }
      }

      // ── Fetch fresh IA data ──────────────────────────────────────────────
      const subjectIds = [...new Set(students.map(s => s.subject_id).filter(Boolean))];
      const freshIAs = await getTeacherIAAttendance(user!.id, subjectIds) || [];

      // ── Build enrollment lookup: USN (lower) + subject_code (lower) → enrollment
      const enrollmentMap = new Map<string, SubjectEnrollment>();
      students.forEach(s => {
        const key = `${(s.profiles?.roll_number || '').toLowerCase().trim()}_${s.subjects.subject_code.toLowerCase().trim()}`;
        enrollmentMap.set(key, s);
      });

      // ── Match parsed rows to enrollments ────────────────────────────────
      const tasks: { enrollment: SubjectEnrollment; status: string; pct: number; remarks: string }[] = [];
      let unmatched = 0;

      for (const pr of parsed.rows) {
        const usnKey = pr.usn.toLowerCase().trim();

        // Try: USN + file subject code (most precise)
        let enrollment = parsed.subjectCode
          ? enrollmentMap.get(`${usnKey}_${parsed.subjectCode.toLowerCase()}`)
          : undefined;

        // Fallback: USN + selected subject code
        if (!enrollment && selectedSubject) {
          const selCode = selectedSubject.split(' — ')[0].toLowerCase().trim();
          enrollment = enrollmentMap.get(`${usnKey}_${selCode}`);
        }

        // Fallback: USN alone (first match across any subject)
        if (!enrollment) {
          enrollment = filtered.find(
            s => (s.profiles?.roll_number || '').toLowerCase().trim() === usnKey,
          );
        }

        if (!enrollment) { unmatched++; continue; }

        const pct = pr.attendancePct;

        // Determine clearance status (same logic as CSV upload)
        const subjectIAs = freshIAs.filter((ia: any) => ia.subject_id === enrollment!.subject_id);
        const iaPresentCount = subjectIAs.filter(
          (ia: any) => ia.student_id === enrollment!.student_id && ia.is_present,
        ).length;

        const attendanceOk = pct >= 85;
        const iaOk = iaPresentCount >= 2;

        let status: string;
        let remarks: string;

        if (attendanceOk && iaOk) {
          status = 'completed';
          remarks = '';
        } else if (!attendanceOk && !iaOk) {
          status = 'rejected';
          remarks = `Low Attendance (<85%) & Insufficient IA Attendance (${iaPresentCount}/2 required)`;
        } else if (!attendanceOk) {
          status = 'rejected';
          remarks = `Low Attendance (<85%)`;
        } else {
          status = 'rejected';
          remarks = `Insufficient IA Attendance (${iaPresentCount}/2 required)`;
        }

        tasks.push({ enrollment, status, pct, remarks });
      }

      // Fast bulk update: 1 auth call, 50 parallel, 1 log entry
      const batchInput = tasks.map(t => ({
        enrollmentId: t.enrollment.id,
        status: t.status,
        attendancePct: t.pct,
        remarks: t.remarks,
      }));
      const { updated, errors: dbErrors } = await batchMarkFacultyAttendance(batchInput);

      const rowErrSummary = parsed.rowErrors.length > 0 ? ` ${parsed.rowErrors.length} row issue(s).` : '';
      const unmatchedSummary = unmatched > 0 ? ` ${unmatched} USN(s) not matched.` : '';
      const dbErrSummary = dbErrors > 0 ? ` ${dbErrors} DB error(s).` : '';

      setCsvUploadMsg(`✅ Updated ${updated} students.${rowErrSummary}${unmatchedSummary}${dbErrSummary}`);
      await fetchData();
    } catch (err: any) {
      setCsvUploadMsg(`❌ Error reading Excel: ${err.message}`);
    }

    e.target.value = '';
  };

  // Unified handler — routes to Excel or CSV parser based on file extension
  const handleAttendanceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      handleInstituteExcelUpload(e);
    } else {
      handleAttendanceCSVUpload(e);
    }
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAttendanceChange = (id: string, pctString: string) => {
    const pct = parseInt(pctString);
    if (isNaN(pct) && pctString !== '') return;
    let newPct = isNaN(pct) ? null : Math.min(100, Math.max(0, pct));
    // Preview badge: only attendance check here (IA checked on save)
    const previewStatus = (newPct !== null && newPct < 85) ? 'rejected' : (newPct !== null && newPct >= 85) ? 'pending' : undefined;
    setStudents(prev => prev.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, attendance_pct: newPct };
      if (previewStatus) updated.status = previewStatus;
      return updated;
    }));
  };

  const updateAttendance = async (id: string) => {
    // Block manual update when frozen
    if (attendanceFrozen) {
      alert('❄️ Attendance is currently frozen by the admin. Manual updates are not allowed.');
      return;
    }
    try {
      const enrollment = students.find(s => s.id === id);
      if (!enrollment) return;
      
      const pct = Math.min(100, Math.max(0, enrollment.attendance_pct || 0));

      // Fetch IA data fresh from DB — query by subject_ids to include COE-uploaded records
      const freshIAs = await getTeacherIAAttendance(user!.id, [enrollment.subject_id]) || [];
      const subjectIAs = freshIAs.filter((ia: any) => ia.subject_id === enrollment.subject_id);
      const iaPresentCount = subjectIAs.filter((ia: any) => ia.student_id === enrollment.student_id && ia.is_present).length;

      // BOTH conditions ALWAYS required for COMPLETED:
      // 1. Attendance >= 85%
      // 2. Minimum 2 IAs present (strictly enforced regardless of IAs conducted count)
      const attendanceOk = pct >= 85;
      const iaOk = iaPresentCount >= 2;

      let status: string;
      let remarks: string;

      if (attendanceOk && iaOk) {
        status = 'completed';
        remarks = ''; // No remarks for cleared students
      } else if (!attendanceOk && !iaOk) {
        status = 'rejected';
        remarks = `Low Attendance (<85%) & Insufficient IA Attendance (${iaPresentCount}/2 required)`;
      } else if (!attendanceOk) {
        status = 'rejected';
        remarks = `Low Attendance (<85%)`;
      } else {
        status = 'rejected';
        remarks = `Insufficient IA Attendance (${iaPresentCount}/2 required)`;
      }

      await markFacultySubjectStatus(id, status, pct, remarks);
      setStudents(prev => prev.map(s => s.id === id ? { ...s, status, remarks, attendance_pct: pct } : s));
    } catch (err: any) {
      console.error("Attendance update error:", err);
      fetchData();
    }
  };


  // Group IA records by ia_number — always show all 3 IAs
  const iasByNumber: Record<number, IARecord[]> = { 1: [], 2: [], 3: [] };
  iaRecords.forEach(r => {
    if (!iasByNumber[r.ia_number]) iasByNumber[r.ia_number] = [];
    iasByNumber[r.ia_number].push(r);
  });
  // Sort each IA group by roll_number (USN)
  Object.values(iasByNumber).forEach(arr => arr.sort((a, b) => (a.profiles?.roll_number || '').localeCompare(b.profiles?.roll_number || '')));
  const iaNumbers = [1, 2, 3];

  // Clearance tab filters — Hierarchical: Department → Semester → Section
  const deptMap = new Map<string, string>();
  students.forEach(s => {
    const deptName = s.subjects?.departments?.name || s.profiles?.departments?.name || 'Unassigned';
    if (!deptMap.has(deptName)) deptMap.set(deptName, deptName);
  });
  const allDepartments = Array.from(deptMap.keys()).sort();

  const studentsInDept = selectedDepartment
    ? students.filter(s => (s.subjects?.departments?.name || s.profiles?.departments?.name || 'Unassigned') === selectedDepartment)
    : students;

  const semestersMap = new Map();
  studentsInDept.forEach(s => {
    const id = s.profiles?.semester_id;
    const name = s.profiles?.semesters?.name || 'Unassigned Semester';
    if (id && !semestersMap.has(id)) semestersMap.set(id, { id, name });
  });
  const allSemesters = Array.from(semestersMap.values()).sort((a: any, b: any) => {
    const na = parseInt(a.name) || 99;
    const nb = parseInt(b.name) || 99;
    return na - nb;
  });

  const studentsInSemester = selectedSemester 
    ? studentsInDept.filter(s => s.profiles?.semester_id === selectedSemester)
    : studentsInDept;

  const allSections = Array.from(new Set(studentsInSemester.map(s => s.profiles?.section || 'Unassigned'))).sort();

  const filtered = studentsInSemester.filter(s => {
    const matchesSearch = s.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.subjects.subject_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSection = selectedSection ? (s.profiles?.section || 'Unassigned') === selectedSection : true;
    return matchesSearch && matchesSection;
  }).sort((a, b) => (a.profiles?.roll_number || '').localeCompare(b.profiles?.roll_number || ''));

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Faculty Dashboard</h1>
            <p className="text-muted-foreground">Manage student clearance and internal assessments.</p>
          </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetchData()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {activeTab === 'clearance' && (
            <div className="relative">
               <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
               <input 
                 type="text" 
                 placeholder="Search students or subjects..." 
                 className="pl-10 pr-4 py-2 bg-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary w-full md:w-64"
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
               />
            </div>
          )}
        </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setActiveTab('clearance')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'clearance'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Student Clearance
          </button>
          <button
            onClick={() => setActiveTab('manage-ia')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'manage-ia'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Manage IAs
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
              activeTab === 'assignments'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Assignments
          </button>
          {(profile?.is_oe_faculty || profile?.role === 'oe') && (
            <button
              onClick={() => setActiveTab('oe-attendance')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                activeTab === 'oe-attendance'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
              }`}
            >
              <Globe className="w-4 h-4" />
              OE Attendance
            </button>
          )}
        </div>
      </div>

      {/* ======================== CLEARANCE TAB ======================== */}
      {activeTab === 'clearance' && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          {/* Frozen banner — prominently shown when admin has frozen attendance */}
          {attendanceFrozen && (
            <div className="flex items-center gap-3 px-6 py-4 bg-blue-500/10 border-b border-blue-500/20 text-blue-700 dark:text-blue-300">
              <Snowflake className="w-5 h-5 shrink-0 animate-pulse" />
              <div>
                <p className="font-bold text-sm">Attendance is frozen by the admin</p>
                <p className="text-xs text-muted-foreground mt-0.5">You cannot update attendance (manually or via upload) until the admin unfreezes it.</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading students...</div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No students assigned to your subjects yet.</div>
          ) : (
            <div className="flex flex-col">
              {/* Breadcrumb Navigation */}
              <div className="flex bg-secondary/10 p-3 items-center text-sm font-medium text-muted-foreground overflow-x-auto whitespace-nowrap border-b border-border">
                <button 
                  onClick={() => { setSelectedDepartment(null); setSelectedSemester(null); setSelectedSection(null); setSelectedSubject(null); }} 
                  className={`hover:text-primary transition-colors flex items-center ${!selectedDepartment ? 'text-primary font-bold' : ''}`}
                >
                  All Departments
                </button>
                {selectedDepartment && (
                  <>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <button 
                      onClick={() => { setSelectedSemester(null); setSelectedSection(null); setSelectedSubject(null); }} 
                      className={`hover:text-primary transition-colors ${selectedDepartment && !selectedSemester ? 'text-primary font-bold' : ''}`}
                    >
                      {selectedDepartment}
                    </button>
                  </>
                )}
                {selectedSemester && (
                  <>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <button 
                      onClick={() => { setSelectedSection(null); setSelectedSubject(null); }} 
                      className={`hover:text-primary transition-colors ${selectedSemester && !selectedSection ? 'text-primary font-bold' : ''}`}
                    >
                      Sem {allSemesters.find((s: any) => s.id === selectedSemester)?.name || '?'}
                    </button>
                  </>
                )}
                {selectedSection && (
                  <>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <button
                      onClick={() => { setSelectedSubject(null); }}
                      className={`hover:text-primary transition-colors ${selectedSection && !selectedSubject ? 'text-primary font-bold' : ''}`}
                    >
                      Section {selectedSection}
                    </button>
                  </>
                )}
                {selectedSubject && (
                  <>
                    <ChevronRight className="w-4 h-4 mx-2" />
                    <span className="text-primary font-bold">{selectedSubject}</span>
                  </>
                )}
              </div>

              {/* CSV Actions Bar — only show when a subject is selected */}
              {selectedSubject && (
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/5">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Bulk Actions:</span>
                  <button
                    onClick={downloadAttendanceTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors border border-border"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Template
                  </button>
                  <button
                    onClick={() => clearanceCsvRef.current?.click()}
                    disabled={attendanceFrozen}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                      attendanceFrozen
                        ? 'bg-secondary/50 text-muted-foreground border-border cursor-not-allowed opacity-50'
                        : 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/30'
                    }`}
                    title={attendanceFrozen ? '❄️ Attendance is frozen by admin' : "Upload the institute's Excel attendance sheet (.xlsx) or a CSV file"}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {attendanceFrozen ? 'Upload Frozen' : 'Upload Attendance'}
                  </button>
                  {/* Accepts both institute Excel (.xlsx/.xls) and plain CSV */}
                  <input
                    ref={clearanceCsvRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleAttendanceFileUpload}
                  />
                  {csvUploadMsg && (
                    <span className={`text-xs font-medium ${
                      csvUploadMsg.startsWith('Error') || csvUploadMsg.startsWith('❌')
                        ? 'text-destructive'
                        : csvUploadMsg.startsWith('⚠️')
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                    }`}>
                      {csvUploadMsg}
                    </span>
                  )}
                </div>
              )}

              {/* LEVEL 1: Department Cards */}
              {!selectedDepartment && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
                  {allDepartments.length === 0 ? (
                    <div className="col-span-full p-8 text-center text-muted-foreground">No departments found.</div>
                  ) : allDepartments.map(dept => {
                    const deptStudents = students.filter(s => (s.subjects?.departments?.name || s.profiles?.departments?.name || 'Unassigned') === dept);
                    const cleared = deptStudents.filter(s => s.status === 'completed').length;
                    return (
                      <button
                        key={dept}
                        onClick={() => setSelectedDepartment(dept)}
                        className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-6 text-left transition-all hover:shadow-md group"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-indigo-500" />
                          </div>
                          <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">{dept}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">{deptStudents.length} students</span>
                          <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{cleared} cleared</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground mt-3 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* LEVEL 2: Semester Cards */}
              {selectedDepartment && !selectedSemester && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
                  {allSemesters.length === 0 ? (
                    <div className="col-span-full p-8 text-center text-muted-foreground">No semesters in this department.</div>
                  ) : allSemesters.map((sem: any) => {
                    const semStudents = studentsInDept.filter(s => s.profiles?.semester_id === sem.id);
                    const cleared = semStudents.filter(s => s.status === 'completed').length;
                    return (
                      <button
                        key={sem.id}
                        onClick={() => setSelectedSemester(sem.id)}
                        className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
                            <Layers className="w-4 h-4 text-amber-500" />
                          </div>
                          <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">Sem {sem.name}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{semStudents.length} students</span>
                          <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{cleared}/{semStudents.length}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* LEVEL 3: Section Cards */}
              {selectedSemester && !selectedSection && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
                  {allSections.length === 0 ? (
                    <div className="col-span-full p-8 text-center text-muted-foreground">No sections in this semester.</div>
                  ) : allSections.map(section => {
                    const secStudents = studentsInSemester.filter(s => (s.profiles?.section || 'Unassigned') === section);
                    const cleared = secStudents.filter(s => s.status === 'completed').length;
                    return (
                      <button
                        key={section}
                        onClick={() => setSelectedSection(section)}
                        className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                            <Users className="w-4 h-4 text-primary" />
                          </div>
                          <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">Section {section}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{secStudents.length} students</span>
                          <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{cleared}/{secStudents.length}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* LEVEL 4: Subject Cards */}
              {selectedSection && !selectedSubject && (() => {
                const sectionStudents = filtered;
                if (sectionStudents.length === 0) {
                  return <div className="p-8 text-center text-muted-foreground">No students in this section.</div>;
                }
                const subjectGroups: Record<string, typeof filtered> = {};
                sectionStudents.forEach(s => {
                  const key = `${s.subjects.subject_code} — ${s.subjects.subject_name}`;
                  if (!subjectGroups[key]) subjectGroups[key] = [];
                  subjectGroups[key].push(s);
                });
                const subjectKeys = Object.keys(subjectGroups).sort();
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
                    {subjectKeys.map(subjectKey => {
                      const subStudents = subjectGroups[subjectKey];
                      const completedCount = subStudents.filter(s => s.status === 'completed').length;
                      const rejectedCount = subStudents.filter(s => s.status === 'rejected').length;
                      const pendingCount = subStudents.filter(s => s.status === 'pending').length;
                      return (
                        <button
                          key={subjectKey}
                          onClick={() => setSelectedSubject(subjectKey)}
                          className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                              <BookOpen className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-bold text-foreground group-hover:text-primary transition-colors text-sm">{subjectKey}</h3>
                              <p className="text-xs text-muted-foreground">{subStudents.length} students</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {completedCount > 0 && <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{completedCount} Cleared</span>}
                            {rejectedCount > 0 && <span className="text-xs font-medium bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">{rejectedCount} Rejected</span>}
                            {pendingCount > 0 && <span className="text-xs font-medium bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">{pendingCount} Pending</span>}
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground mt-3 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* LEVEL 5: Students Table */}
              {selectedSection && selectedSubject && (() => {
                const subjectStudents = filtered.filter(s => `${s.subjects.subject_code} — ${s.subjects.subject_name}` === selectedSubject);
                if (subjectStudents.length === 0) {
                  return <div className="p-8 text-center text-muted-foreground">No students found for this subject.</div>;
                }
                const completedCount = subjectStudents.filter(s => s.status === 'completed').length;
                const rejectedCount = subjectStudents.filter(s => s.status === 'rejected').length;
                const pendingCount = subjectStudents.filter(s => s.status === 'pending').length;
                return (
                  <div className="p-4">
                    <div className="border border-border rounded-2xl overflow-hidden bg-card">
                      <div className="flex items-center justify-between px-6 py-4 bg-secondary/20 border-b border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-bold text-foreground text-sm">{selectedSubject}</h4>
                            <p className="text-xs text-muted-foreground">{subjectStudents.length} students</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {completedCount > 0 && <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2.5 py-1 rounded-full">{completedCount} Cleared</span>}
                          {rejectedCount > 0 && <span className="text-xs font-medium bg-destructive/10 text-destructive px-2.5 py-1 rounded-full">{rejectedCount} Rejected</span>}
                          {pendingCount > 0 && <span className="text-xs font-medium bg-amber-500/10 text-amber-600 px-2.5 py-1 rounded-full">{pendingCount} Pending</span>}
                        </div>
                      </div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                            <th className="px-6 py-3 font-semibold">Student Name</th>
                            <th className="px-6 py-3 font-semibold">USN</th>
                            <th className="px-6 py-3 font-semibold">Attendance %</th>
                            <th className="px-6 py-3 font-semibold">Status</th>
                            <th className="px-6 py-3 font-semibold text-right">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {subjectStudents.map(student => (
                            <tr key={student.id} className="hover:bg-secondary/20 transition-colors">
                              <td className="px-6 py-3 font-medium text-foreground">{student.profiles?.full_name || 'Unknown'}</td>
                              <td className="px-6 py-3 text-sm text-muted-foreground">{student.profiles?.roll_number || 'N/A'}</td>
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number" min="0" max="100"
                                    readOnly={attendanceFrozen}
                                    disabled={attendanceFrozen}
                                    className={`w-20 p-2 border rounded-xl text-sm bg-background transition-colors focus:ring-2 focus:ring-primary focus:outline-none ${
                                      attendanceFrozen
                                        ? 'opacity-50 cursor-not-allowed bg-secondary/40'
                                        : (student.attendance_pct || 0) < 85 ? 'border-destructive/50 text-destructive' : 'border-emerald-500/50 text-emerald-600'
                                    }`}
                                    value={student.attendance_pct === null ? '' : student.attendance_pct}
                                    onChange={e => !attendanceFrozen && handleAttendanceChange(student.id, e.target.value)}
                                    onBlur={() => !attendanceFrozen && updateAttendance(student.id)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !attendanceFrozen) { e.preventDefault(); const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"][max="100"]')); const i = inputs.indexOf(e.target as HTMLInputElement); (e.target as HTMLInputElement).blur(); if (i >= 0 && i < inputs.length - 1) setTimeout(() => inputs[i+1]?.focus(), 50); } }}
                                  />
                                  <span className="text-xs text-muted-foreground font-medium">Min 85%</span>
                                </div>
                              </td>
                              <td className="px-6 py-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  student.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                  student.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                                  'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                }`}>
                                  {student.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-right text-sm font-medium">
                                {student.status === 'rejected' && student.remarks ? (
                                  <span className="text-destructive">{student.remarks}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ======================== MANAGE IAs TAB ======================== */}
      {activeTab === 'manage-ia' && (
        <div className="space-y-6">
          {/* Hierarchical Subject Selector: Department → Semester → Section → Subject */}
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {/* IA Breadcrumb */}
            <div className="flex bg-secondary/10 p-3 items-center text-sm font-medium text-muted-foreground overflow-x-auto whitespace-nowrap border-b border-border">
              <button
                onClick={() => { setIaDeptFilter(null); setIaSemFilter(null); setIaSectionFilter(null); setSelectedSubjectId(null); }}
                className={`hover:text-primary transition-colors ${!iaDeptFilter ? 'text-primary font-bold' : ''}`}
              >
                All Departments
              </button>
              {iaDeptFilter && (
                <>
                  <ChevronRight className="w-4 h-4 mx-2" />
                  <button
                    onClick={() => { setIaSemFilter(null); setIaSectionFilter(null); setSelectedSubjectId(null); }}
                    className={`hover:text-primary transition-colors ${iaDeptFilter && !iaSemFilter ? 'text-primary font-bold' : ''}`}
                  >
                    {iaDeptFilter === '__OE__' ? 'OE Students' : iaDeptFilter}
                  </button>
                </>
              )}
              {iaSemFilter && (
                <>
                  <ChevronRight className="w-4 h-4 mx-2" />
                  <button
                    onClick={() => { setIaSectionFilter(null); setSelectedSubjectId(null); }}
                    className={`hover:text-primary transition-colors ${iaSemFilter && !iaSectionFilter ? 'text-primary font-bold' : ''}`}
                  >
                    {iaSemFilter}
                  </button>
                </>
              )}
              {iaSectionFilter && (
                <>
                  <ChevronRight className="w-4 h-4 mx-2" />
                  <button
                    onClick={() => { setSelectedSubjectId(null); }}
                    className={`hover:text-primary transition-colors ${iaSectionFilter && !selectedSubjectId ? 'text-primary font-bold' : ''}`}
                  >
                    Section {iaSectionFilter}
                  </button>
                </>
              )}
              {selectedSubjectId && (
                <>
                  <ChevronRight className="w-4 h-4 mx-2" />
                  <span className="text-primary font-bold">
                    {teacherSubjects.find(s => s.id === selectedSubjectId)?.subject_name || 'Subject'}
                  </span>
                </>
              )}
            </div>

            {teacherSubjects.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No subjects assigned to you yet.</div>
            ) : (() => {
              // Separate OE subjects from regular subjects
              const regularSubjects = teacherSubjects.filter(s => s.subject_type !== 'open_elective');
              const oeSubjects = teacherSubjects.filter(s => s.subject_type === 'open_elective');
              const hasOE = oeSubjects.length > 0;
              const isOEMode = iaDeptFilter === '__OE__';

              // For OE mode, use oeSubjects; for regular, use regularSubjects
              const activeSubjects = isOEMode ? oeSubjects : regularSubjects;

              // Group by department (regular subjects only for dept cards)
              const iaDepts = Array.from(new Set(regularSubjects.map(s => s.departments?.name || 'Unassigned'))).sort();
              const filteredByDept = iaDeptFilter && !isOEMode ? activeSubjects.filter(s => (s.departments?.name || 'Unassigned') === iaDeptFilter) : activeSubjects;
              const iaSems = Array.from(new Set(filteredByDept.map(s => s.semesters?.name ? `Sem ${s.semesters.name}` : 'Unassigned'))).sort((a, b) => {
                const na = parseInt(a.replace('Sem ', '')) || 99;
                const nb = parseInt(b.replace('Sem ', '')) || 99;
                return na - nb;
              });
              const filteredBySem = iaSemFilter ? filteredByDept.filter(s => (s.semesters?.name ? `Sem ${s.semesters.name}` : 'Unassigned') === iaSemFilter) : filteredByDept;

              // Derive sections: use oeStudents for OE mode, regular students otherwise
              const semSubjectIds = new Set(filteredBySem.map(s => s.id));
              const activeStudents = isOEMode ? oeStudents : students;
              const semStudents = activeStudents.filter(s => semSubjectIds.has(s.subject_id));
              const iaSections = Array.from(new Set(semStudents.map(s => s.profiles?.section || 'Unassigned'))).sort();

              // Filter subjects by section
              const filteredBySection = iaSectionFilter
                ? filteredBySem.filter(sub => activeStudents.some(s => s.subject_id === sub.id && (s.profiles?.section || 'Unassigned') === iaSectionFilter))
                : filteredBySem;

              return (
                <>
                  {/* IA Level 1: Department Cards + OE Card */}
                  {!iaDeptFilter && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
                      {iaDepts.map(dept => {
                        const count = regularSubjects.filter(s => (s.departments?.name || 'Unassigned') === dept).length;
                        return (
                          <button key={dept} onClick={() => setIaDeptFilter(dept)} className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-6 text-left transition-all hover:shadow-md group">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-indigo-500" />
                              </div>
                              <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">{dept}</h3>
                            </div>
                            <span className="text-sm text-muted-foreground">{count} subject{count !== 1 ? 's' : ''}</span>
                            <ChevronRight className="w-5 h-5 text-muted-foreground mt-2 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                          </button>
                        );
                      })}
                      {/* OE Students Card — only visible if teacher has OE subjects */}
                      {hasOE && (
                        <button onClick={() => setIaDeptFilter('__OE__')} className="bg-violet-500/5 hover:bg-violet-500/15 border-2 border-violet-500/30 hover:border-violet-500/50 rounded-2xl p-6 text-left transition-all hover:shadow-md group">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center">
                              <Globe className="w-5 h-5 text-violet-500" />
                            </div>
                            <h3 className="font-bold text-violet-600 dark:text-violet-400 text-lg group-hover:text-violet-500 transition-colors">OE Students</h3>
                          </div>
                          <span className="text-sm text-muted-foreground">{oeSubjects.length} OE subject{oeSubjects.length !== 1 ? 's' : ''}</span>
                          <ChevronRight className="w-5 h-5 text-violet-400 mt-2 group-hover:text-violet-500 group-hover:translate-x-1 transition-all" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* IA Level 2: Semester Cards */}
                  {iaDeptFilter && !iaSemFilter && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
                      {iaSems.map(sem => {
                        const count = filteredByDept.filter(s => (s.semesters?.name ? `Sem ${s.semesters.name}` : 'Unassigned') === sem).length;
                        return (
                          <button key={sem} onClick={() => setIaSemFilter(sem)} className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
                                <Layers className="w-4 h-4 text-amber-500" />
                              </div>
                              <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{sem}</h3>
                            </div>
                            <span className="text-sm text-muted-foreground">{count} subject{count !== 1 ? 's' : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* IA Level 3: Section Cards */}
                  {iaDeptFilter && iaSemFilter && !iaSectionFilter && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
                      {iaSections.length === 0 ? (
                        <div className="col-span-full p-8 text-center text-muted-foreground">No sections found in this semester.</div>
                      ) : iaSections.map(section => {
                        const secStudents = semStudents.filter(s => (s.profiles?.section || 'Unassigned') === section);
                        const subjectCount = new Set(secStudents.map(s => s.subject_id)).size;
                        return (
                          <button key={section} onClick={() => setIaSectionFilter(section)} className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                                <Users className="w-4 h-4 text-primary" />
                              </div>
                              <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">Section {section}</h3>
                            </div>
                            <span className="text-sm text-muted-foreground">{subjectCount} subject{subjectCount !== 1 ? 's' : ''} • {secStudents.length} students</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* IA Level 4: Subject Cards */}
                  {iaDeptFilter && iaSemFilter && iaSectionFilter && !selectedSubjectId && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
                      {filteredBySection.length === 0 ? (
                        <div className="col-span-full p-8 text-center text-muted-foreground">No subjects in this section.</div>
                      ) : filteredBySection.map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedSubjectId(sub.id)}
                          className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                              <BookOpen className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-bold text-foreground group-hover:text-primary transition-colors text-sm">{sub.subject_code}</h3>
                              <p className="text-xs text-muted-foreground">{sub.subject_name}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground mt-2 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* IA Management Area — Read Only */}
          {selectedSubjectId && (
            <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
              {iaLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading IA data...</div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-primary" />
                        Internal Assessments
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        View-only — Attendance is managed by COE
                      </p>
                    </div>
                  </div>

                  {/* All 3 IAs */}
                  <div className="space-y-3">
                    {iaNumbers.map(iaNum => {
                      const records = iasByNumber[iaNum] || [];
                      const presentCount = records.filter(r => r.is_present).length;
                      const absentCount = records.filter(r => !r.is_present).length;
                      const hasData = records.length > 0;
                      const isExpanded = expandedIA === iaNum;
                      
                      return (
                        <div key={iaNum} className="border border-border rounded-2xl overflow-hidden bg-secondary/20 hover:bg-secondary/30 transition-colors">
                          <button
                            onClick={() => setExpandedIA(isExpanded ? null : iaNum)}
                            className="w-full flex items-center justify-between px-6 py-4 text-left"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                                <span className="text-primary font-bold text-sm">IA-{iaNum}</span>
                              </div>
                              <div>
                                <h4 className="font-semibold text-foreground">Internal Assessment {iaNum}</h4>
                                <div className="flex items-center gap-3 mt-1">
                                  {hasData ? (
                                    <>
                                      <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2.5 py-1 rounded-full">
                                        {presentCount} Present
                                      </span>
                                      <span className="text-xs font-medium bg-destructive/10 text-destructive px-2.5 py-1 rounded-full">
                                        {absentCount} Absent
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-xs font-medium text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                                      No data yet
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                          </button>
                          
                          {isExpanded && (
                            <div className="border-t border-border">
                              {hasData ? (
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider">
                                      <th className="px-6 py-3 font-semibold">#</th>
                                      <th className="px-6 py-3 font-semibold">Student Name</th>
                                      <th className="px-6 py-3 font-semibold">Roll No</th>
                                      <th className="px-6 py-3 font-semibold">Section</th>
                                      <th className="px-6 py-3 font-semibold text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {records.map((record, idx) => (
                                      <tr key={record.id || `${record.student_id}-${iaNum}`} className="hover:bg-secondary/10 transition-colors">
                                        <td className="px-6 py-3 text-sm text-muted-foreground">{idx + 1}</td>
                                        <td className="px-6 py-3 font-medium text-foreground">{record.profiles?.full_name || 'Unknown'}</td>
                                        <td className="px-6 py-3 text-sm text-muted-foreground">{record.profiles?.roll_number || 'N/A'}</td>
                                        <td className="px-6 py-3 text-sm text-muted-foreground">{record.profiles?.section || 'N/A'}</td>
                                        <td className="px-6 py-3 text-center">
                                          {record.is_present ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600">
                                              <CheckCircle2 className="w-3.5 h-3.5" /> Present
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-destructive/15 text-destructive">
                                              <XCircle className="w-3.5 h-3.5" /> Absent
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="p-8 text-center">
                                  <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                  <p className="text-sm text-muted-foreground font-medium">No attendance data uploaded by COE for IA-{iaNum} yet.</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================== ASSIGNMENTS TAB ======================== */}
      {activeTab === 'assignments' && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              Assignments
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Toggle assignment status for your students. Pending status blocks student clearance.</p>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground px-6 py-3 border-b border-border bg-secondary/5 flex-wrap">
            <button onClick={() => { setAsnDept(null); setAsnSem(null); setAsnSec(null); setAsnSubject(null); }}
              className={`hover:text-primary transition-colors flex items-center ${!asnDept ? 'text-primary font-bold' : ''}`}>
              All Departments
            </button>
            {asnDept && (<>
              <ChevronRight className="w-4 h-4 mx-1" />
              <button onClick={() => { setAsnSem(null); setAsnSec(null); setAsnSubject(null); }}
                className={`hover:text-primary transition-colors ${asnDept && !asnSem ? 'text-primary font-bold' : ''}`}>{asnDept}</button>
            </>)}
            {asnSem && (<>
              <ChevronRight className="w-4 h-4 mx-1" />
              <button onClick={() => { setAsnSec(null); setAsnSubject(null); }}
                className={`hover:text-primary transition-colors ${asnSem && !asnSec ? 'text-primary font-bold' : ''}`}>Sem {asnSem}</button>
            </>)}
            {asnSec && (<>
              <ChevronRight className="w-4 h-4 mx-1" />
              <button onClick={() => { setAsnSubject(null); }}
                className={`hover:text-primary transition-colors ${asnSec && !asnSubject ? 'text-primary font-bold' : ''}`}>Section {asnSec}</button>
            </>)}
            {asnSubject && (<>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-primary font-bold">{asnSubject}</span>
            </>)}
          </div>

          <div className="p-0">
            {(() => {
              const allEnrollments = students;
              if (allEnrollments.length === 0) return <div className="text-center text-muted-foreground py-8">No students assigned.</div>;

              // LEVEL 1: Department cards
              if (!asnDept) {
                const depts = Array.from(new Set(allEnrollments.map((e: any) => e.profiles?.departments?.name || e.subjects?.departments?.name || 'Unknown'))).sort();
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
                    {depts.map(dept => {
                      const deptItems = allEnrollments.filter((e: any) => (e.profiles?.departments?.name || e.subjects?.departments?.name || 'Unknown') === dept);
                      const submitted = deptItems.filter((e: any) => e.assignment_status !== 'pending').length;
                      return (
                        <button key={dept} onClick={() => setAsnDept(dept)}
                          className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-6 text-left transition-all hover:shadow-md group">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-indigo-500" />
                            </div>
                            <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">{dept}</h3>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">{deptItems.length} enrollments</span>
                            <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{submitted} submitted</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground mt-3 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </button>
                      );
                    })}
                  </div>
                );
              }

              const deptItems = allEnrollments.filter((e: any) => (e.profiles?.departments?.name || e.subjects?.departments?.name || 'Unknown') === asnDept);

              // LEVEL 2: Semester cards
              if (!asnSem) {
                const sems = Array.from(new Set(deptItems.map((e: any) => e.profiles?.semesters?.name || 'Unknown'))).sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
                    {sems.map(sem => {
                      const semItems = deptItems.filter((e: any) => (e.profiles?.semesters?.name || 'Unknown') === sem);
                      const submitted = semItems.filter((e: any) => e.assignment_status !== 'pending').length;
                      return (
                        <button key={sem} onClick={() => setAsnSem(sem)}
                          className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
                              <Layers className="w-4 h-4 text-amber-500" />
                            </div>
                            <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">Sem {sem}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{semItems.length} enrollments</span>
                            <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{submitted}/{semItems.length}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              }

              const semItems = deptItems.filter((e: any) => (e.profiles?.semesters?.name || 'Unknown') === asnSem);

              // LEVEL 3: Section cards
              if (!asnSec) {
                const secs = Array.from(new Set(semItems.map((e: any) => e.profiles?.section || 'Unknown'))).sort();
                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
                    {secs.map(sec => {
                      const secItems = semItems.filter((e: any) => (e.profiles?.section || 'Unknown') === sec);
                      const submitted = secItems.filter((e: any) => e.assignment_status !== 'pending').length;
                      return (
                        <button key={sec} onClick={() => setAsnSec(sec)}
                          className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                              <Users className="w-4 h-4 text-primary" />
                            </div>
                            <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">Section {sec}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{secItems.length} enrollments</span>
                            <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{submitted}/{secItems.length}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              }

              const secItems = semItems.filter((e: any) => (e.profiles?.section || 'Unknown') === asnSec);

              // LEVEL 4: Subject cards
              if (!asnSubject) {
                const subjectMap: Record<string, any[]> = {};
                secItems.forEach((e: any) => {
                  const key = `${e.subjects?.subject_code || ''} — ${e.subjects?.subject_name || 'Unknown'}`;
                  if (!subjectMap[key]) subjectMap[key] = [];
                  subjectMap[key].push(e);
                });
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
                    {Object.entries(subjectMap).sort(([a],[b]) => a.localeCompare(b)).map(([subKey, subItems]) => {
                      const submitted = subItems.filter((e: any) => e.assignment_status !== 'pending').length;
                      const pending = subItems.length - submitted;
                      return (
                        <button key={subKey} onClick={() => setAsnSubject(subKey)}
                          className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                              <BookOpen className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-bold text-foreground group-hover:text-primary transition-colors text-sm">{subKey}</h3>
                              <p className="text-xs text-muted-foreground">{subItems.length} students</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {submitted > 0 && <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{submitted} Submitted</span>}
                            {pending > 0 && <span className="text-xs font-medium bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">{pending} Pending</span>}
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground mt-3 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </button>
                      );
                    })}
                  </div>
                );
              }

              // LEVEL 5: Students table for selected subject
              const subjectStudents = secItems.filter((e: any) => `${e.subjects?.subject_code || ''} — ${e.subjects?.subject_name || 'Unknown'}` === asnSubject);
              if (subjectStudents.length === 0) return <div className="p-8 text-center text-muted-foreground">No students found.</div>;
              const submitted = subjectStudents.filter((e: any) => e.assignment_status !== 'pending').length;
              const pending = subjectStudents.length - submitted;
              return (
                <div>
                  <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
                    <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{submitted} Submitted</span>
                    <span className="text-xs font-medium bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">{pending} Pending</span>
                    <span className="text-xs text-muted-foreground ml-auto">{subjectStudents.length} total</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-secondary/30 text-sm border-b border-border">
                          <th className="p-3 font-semibold">#</th>
                          <th className="p-3 font-semibold">Student</th>
                          <th className="p-3 font-semibold">Roll No</th>
                          <th className="p-3 font-semibold text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {subjectStudents.map((e: any, idx: number) => (
                          <tr key={e.id} className="hover:bg-secondary/10">
                            <td className="p-3 text-sm text-muted-foreground">{idx+1}</td>
                            <td className="p-3 font-medium">{e.profiles?.full_name}</td>
                            <td className="p-3 text-sm font-mono text-muted-foreground">{e.profiles?.roll_number || '—'}</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={async () => {
                                  const newStatus = (e.assignment_status === 'pending') ? 'submitted' : 'pending';
                                  try { await updateAssignmentStatus(e.id, newStatus); refetchData(); } catch (err) { console.error(err); }
                                }}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                  e.assignment_status === 'pending'
                                    ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500 hover:text-white'
                                    : 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                                }`}
                              >
                                {e.assignment_status === 'pending' ? 'Pending' : 'Submitted'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

            {/* ======================== OE ATTENDANCE TAB ======================== */}
      {activeTab === 'oe-attendance' && (profile?.is_oe_faculty || profile?.role === 'oe') && (
        <OEDashboard teacherId={user?.id} />
      )}
    </div>
  );
}
