import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/useAuth';
import { getFacultyPendingStudents, markFacultySubjectStatus, getTeacherSubjectsList, getIACountForSubject, getStudentsForSubject, saveIAAttendance, getIAAttendanceForSubject, getTeacherIAAttendance } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Search, ClipboardList, BookOpen, Plus, Save, ChevronDown, ChevronUp, CheckCircle2, XCircle, Users, Download, Upload, FileSpreadsheet, Edit } from 'lucide-react';

type SubjectEnrollment = {
  id: string;
  student_id: string;
  subject_id: string;
  teacher_id: string;
  status: string;
  attendance_pct: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  subjects: { subject_name: string; subject_code: string };
  profiles: { full_name: string; roll_number?: string | null; section?: string | null; semester_id?: string | null; semesters?: { name: string } | null } | null;
};

type TeacherSubject = {
  id: string;
  subject_name: string;
  subject_code: string;
  semester_id: string;
  semesters: { name: string } | null;
};

type StudentRecord = {
  student_id: string;
  profiles: { id: string; full_name: string; roll_number: string | null; section: string | null; semester_id: string | null } | null;
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

type AttendanceMap = Record<string, boolean>; // student_id -> is_present

export default function FacultyDashboard() {
  const { user } = useAuth();
  // Tab state
  const [activeTab, setActiveTab] = useState<'clearance' | 'manage-ia'>('clearance');

  // === Clearance Tab State (existing) ===
  const [students, setStudents] = useState<SubjectEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [csvUploadMsg, setCsvUploadMsg] = useState<string | null>(null);
  const clearanceCsvRef = useRef<HTMLInputElement>(null);

  // === Manage IAs Tab State ===
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [iaCount, setIaCount] = useState(0);
  const [iaRecords, setIaRecords] = useState<IARecord[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<StudentRecord[]>([]);
  const [iaLoading, setIaLoading] = useState(false);
  const [savingIA, setSavingIA] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  // For new IA form
  const [showNewIAForm, setShowNewIAForm] = useState(false);
  const [newIAAttendance, setNewIAAttendance] = useState<AttendanceMap>({});
  // For viewing existing IAs
  const [expandedIA, setExpandedIA] = useState<number | null>(null);
  const [editingIA, setEditingIA] = useState<number | null>(null);
  const [editAttendanceMap, setEditAttendanceMap] = useState<AttendanceMap>({});
  
  // CSV for IA
  const iaCsvRef = useRef<HTMLInputElement>(null);
  const [iaCsvMsg, setIaCsvMsg] = useState<string | null>(null);

  // IA limits validation for clearance
  const [teacherIAs, setTeacherIAs] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Load IA data when subject changes
  useEffect(() => {
    if (selectedSubjectId && user) {
      loadIAData(selectedSubjectId);
    }
  }, [selectedSubjectId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [data, ias] = await Promise.all([
        getFacultyPendingStudents(user!.id),
        getTeacherIAAttendance(user!.id)
      ]);
      const typedData = data as unknown as SubjectEnrollment[];
      setStudents(typedData);
      setTeacherIAs(ias || []);
      
      const semsMap = new Map();
      typedData.forEach(s => {
          const id = s.profiles?.semester_id;
          const name = s.profiles?.semesters?.name || 'Unassigned Semester';
          if (id && !semsMap.has(id)) semsMap.set(id, { id, name });
      });
      const semsList = Array.from(semsMap.values());
      const initialSem = semsList.length > 0 ? semsList[0].id : null;

      if (!selectedSemester && initialSem) {
        setSelectedSemester(initialSem);
      }
      
      const activeSem = selectedSemester || initialSem;
      if (activeSem) {
        const secs = Array.from(new Set(typedData.filter(s => s.profiles?.semester_id === activeSem).map(s => s.profiles?.section || 'Unassigned'))).sort();
        if (secs.length > 0 && !selectedSection) {
          setSelectedSection(secs[0] as string);
        }
      }

      // Also load teacher subjects for IA tab
      const subjects = await getTeacherSubjectsList(user!.id);
      setTeacherSubjects(subjects as TeacherSubject[]);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadIAData = async (subjectId: string) => {
    if (!user) return;
    setIaLoading(true);
    try {
      const [count, records, studentsList] = await Promise.all([
        getIACountForSubject(subjectId, user.id),
        getIAAttendanceForSubject(subjectId, user.id),
        getStudentsForSubject(subjectId, user.id)
      ]);
      setIaCount(count);
      setIaRecords(records as unknown as IARecord[]);
      setEnrolledStudents(studentsList as unknown as StudentRecord[]);
      setShowNewIAForm(false);
      setExpandedIA(null);
    } catch (err) {
      console.error('Error loading IA data:', err);
    } finally {
      setIaLoading(false);
    }
  };

  const MAX_IAS_PER_SUBJECT = 3;
  const isIALimitReached = iaCount >= MAX_IAS_PER_SUBJECT;

  const handleAddIA = () => {
    if (isIALimitReached) return; // Guard against creating more than max IAs
    // Initialize all students as PRESENT by default
    const initialMap: AttendanceMap = {};
    enrolledStudents.forEach(s => {
      initialMap[s.student_id] = true;
    });
    setNewIAAttendance(initialMap);
    setShowNewIAForm(true);
    setSaveSuccess(null);
    setIaCsvMsg(null);
  };

  const handleSaveIA = async () => {
    if (!user || !selectedSubjectId) return;
    setSavingIA(true);
    setSaveSuccess(null);
    try {
      const newIANumber = iaCount + 1;
      const records = Object.entries(newIAAttendance).map(([studentId, isPresent]) => ({
        student_id: studentId,
        subject_id: selectedSubjectId,
        teacher_id: user.id,
        ia_number: newIANumber,
        is_present: isPresent
      }));
      
      await saveIAAttendance(records);
      setSaveSuccess(`IA-${newIANumber} saved successfully!`);
      setShowNewIAForm(false);
      
      // Reload data
      await loadIAData(selectedSubjectId);
    } catch (err: any) {
      console.error('Error saving IA:', err);
      setSaveSuccess(`Error: ${err?.message || 'Failed to save'}`);
    } finally {
      setSavingIA(false);
    }
  };

  const handleEditIASave = async (editIaNum: number) => {
    if (!user || !selectedSubjectId) return;
    setSavingIA(true);
    setSaveSuccess(null);
    try {
      const records = Object.entries(editAttendanceMap).map(([studentId, isPresent]) => ({
        student_id: studentId,
        subject_id: selectedSubjectId,
        teacher_id: user.id,
        ia_number: editIaNum,
        is_present: isPresent
      }));
      
      await saveIAAttendance(records);
      setSaveSuccess(`IA-${editIaNum} updated successfully!`);
      setEditingIA(null);
      
      // Reload data
      await loadIAData(selectedSubjectId);
    } catch (err: any) {
      console.error('Error saving IA edits:', err);
      setSaveSuccess(`Error: ${err?.message || 'Failed to update IA'}`);
    } finally {
      setSavingIA(false);
    }
  };

  // ==================== CSV HELPERS ====================

  // Download IA CSV template
  const downloadIATemplate = () => {
    const headers = ['roll_number', 'student_name', 'status'];
    const rows = enrolledStudents.map(s => [
      s.profiles?.roll_number || '',
      s.profiles?.full_name || '',
      'Present'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csvContent, `IA_Template_${selectedSubjectId?.substring(0, 8)}.csv`);
  };

  // Upload IA CSV
  const handleIACSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIaCsvMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { setIaCsvMsg('Error: CSV must have a header row and at least one data row.'); return; }

        const header = lines[0].toLowerCase().split(',').map(h => h.trim());
        const rollIdx = header.indexOf('roll_number');
        const statusIdx = header.indexOf('status');
        if (rollIdx === -1 || statusIdx === -1) { setIaCsvMsg('Error: CSV must have "roll_number" and "status" columns.'); return; }

        // Build a roll -> student_id map
        const rollMap = new Map<string, string>();
        enrolledStudents.forEach(s => {
          if (s.profiles?.roll_number) rollMap.set(s.profiles.roll_number.toLowerCase().trim(), s.student_id);
        });

        const updatedMap: AttendanceMap = { ...newIAAttendance };
        let matched = 0;
        let unmatched = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          const roll = (cols[rollIdx] || '').toLowerCase().trim();
          const status = (cols[statusIdx] || '').toLowerCase().trim();
          const studentId = rollMap.get(roll);
          if (studentId) {
            updatedMap[studentId] = status === 'present' || status === 'p' || status === 'yes' || status === '1';
            matched++;
          } else {
            unmatched++;
          }
        }

        setNewIAAttendance(updatedMap);
        setIaCsvMsg(`✅ Imported: ${matched} matched, ${unmatched} unmatched.`);
      } catch (err: any) {
        setIaCsvMsg(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  // Download attendance % CSV template for the clearance tab
  const downloadAttendanceTemplate = () => {
    const headers = ['roll_number', 'student_name', 'subject_code', 'subject_name', 'attendance_pct'];
    const rows = filtered.map(s => [
      s.profiles?.roll_number || '',
      s.profiles?.full_name || '',
      s.subjects.subject_code,
      s.subjects.subject_name,
      s.attendance_pct !== null ? s.attendance_pct.toString() : ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const semName = allSemesters.find(s => s.id === selectedSemester)?.name || 'All';
    downloadCSV(csvContent, `Attendance_${semName}_Section${selectedSection || 'All'}.csv`);
  };

  // Upload attendance % CSV
  const handleAttendanceCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploadMsg(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) { setCsvUploadMsg('Error: CSV must have header + data rows.'); return; }

        const header = lines[0].toLowerCase().replace(/"/g, '').split(',').map(h => h.trim());
        const rollIdx = header.indexOf('roll_number');
        const pctIdx = header.indexOf('attendance_pct');
        const codeIdx = header.indexOf('subject_code');
        if (rollIdx === -1 || pctIdx === -1) { setCsvUploadMsg('Error: CSV needs "roll_number" and "attendance_pct" columns.'); return; }

        // Build a lookup: roll+subjectCode -> enrollment record
        const enrollmentMap = new Map<string, SubjectEnrollment>();
        students.forEach(s => {
          const key = `${(s.profiles?.roll_number || '').toLowerCase().trim()}_${s.subjects.subject_code.toLowerCase().trim()}`;
          enrollmentMap.set(key, s);
        });

        let updated = 0;
        let errors = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].replace(/"/g, '').split(',').map(c => c.trim());
          const roll = (cols[rollIdx] || '').toLowerCase().trim();
          const pctStr = cols[pctIdx] || '';
          const code = codeIdx !== -1 ? (cols[codeIdx] || '').toLowerCase().trim() : '';
          const pct = parseInt(pctStr);
          if (isNaN(pct) || pct < 0 || pct > 100) { errors++; continue; }

          // Try to find matching enrollment
          let enrollment: SubjectEnrollment | undefined;
          if (code) {
            enrollment = enrollmentMap.get(`${roll}_${code}`);
          } else {
            // If no subject code column, find first match by roll number in filtered
            enrollment = filtered.find(s => (s.profiles?.roll_number || '').toLowerCase().trim() === roll);
          }

          if (enrollment) {
            let status = pct >= 85 ? 'completed' : 'rejected';
            let remarks = pct >= 85 ? 'Cleared by Faculty' : 'Low Attendance (<85%)';

            // Override with IA rule (only if at least 2 IAs have been conducted for this subject)
            const subjectIAs = teacherIAs.filter(ia => ia.subject_id === enrollment?.subject_id);
            // Get unique IA numbers for this subject to see how many IAs have been conducted
            const uniqueIAsConducted = new Set(subjectIAs.map(ia => ia.ia_number)).size;
            
            if (uniqueIAsConducted >= 2) {
              const iaPresentCount = subjectIAs.filter(ia => ia.student_id === enrollment?.student_id && ia.is_present).length;
              if (iaPresentCount < 2) {
                status = 'rejected';
                remarks = `Low IA Attendance (${iaPresentCount}/2 required)`;
              }
            }

            try {
              await markFacultySubjectStatus(enrollment.id, status, pct, remarks);
              updated++;
            } catch { errors++; }
          } else {
            errors++;
          }
        }

        setCsvUploadMsg(`✅ Updated: ${updated} students. ${errors > 0 ? `${errors} errors/unmatched.` : ''}`);
        await fetchData();
      } catch (err: any) {
        setCsvUploadMsg(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
    const newPct = isNaN(pct) ? null : pct;
    // Immediately update local status preview so the badge reflects the change
    const previewStatus = (newPct !== null && newPct < 85) ? 'rejected' : (newPct !== null && newPct >= 85) ? 'completed' : undefined;
    const previewRemarks = previewStatus === 'rejected' ? 'Low Attendance (<85%)' : previewStatus === 'completed' ? 'Cleared by Faculty' : undefined;
    setStudents(prev => prev.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, attendance_pct: newPct };
      if (previewStatus) {
        updated.status = previewStatus;
        updated.remarks = previewRemarks || s.remarks;
      }
      return updated;
    }));
  };

  const updateAttendance = async (id: string) => {
    try {
      const enrollment = students.find(s => s.id === id);
      if (!enrollment) return;
      
      const pct = enrollment.attendance_pct || 0;
      let status = pct >= 85 ? 'completed' : 'rejected';
      let remarks = pct >= 85 ? 'Cleared by Faculty' : 'Low Attendance (<85%)';

      // Override with IA rule (only if at least 2 IAs have been conducted for this subject)
      const subjectIAs = teacherIAs.filter(ia => ia.subject_id === enrollment.subject_id);
      const uniqueIAsConducted = new Set(subjectIAs.map(ia => ia.ia_number)).size;
      
      if (uniqueIAsConducted >= 2) {
        const iaPresentCount = subjectIAs.filter(ia => ia.student_id === enrollment.student_id && ia.is_present).length;
        if (iaPresentCount < 2) {
          status = 'rejected';
          remarks = `Low IA Attendance (${iaPresentCount}/2 required)`;
        }
      }

      await markFacultySubjectStatus(id, status, pct, remarks);
      // Update local state immediately
      setStudents(prev => prev.map(s => s.id === id ? { ...s, status, remarks, attendance_pct: pct } : s));
    } catch (err: any) {
      console.error("Attendance update error:", err);
      // Revert by re-fetching from DB on error
      fetchData();
    }
  };

  // Group IA records by ia_number
  const iasByNumber: Record<number, IARecord[]> = {};
  iaRecords.forEach(r => {
    if (!iasByNumber[r.ia_number]) iasByNumber[r.ia_number] = [];
    iasByNumber[r.ia_number].push(r);
  });
  const iaNumbers = Object.keys(iasByNumber).map(Number).sort((a, b) => a - b);

  // Clearance tab filters
  const semestersMap = new Map();
  students.forEach(s => {
      const id = s.profiles?.semester_id;
      const name = s.profiles?.semesters?.name || 'Unassigned Semester';
      if (id && !semestersMap.has(id)) semestersMap.set(id, { id, name });
  });
  const allSemesters = Array.from(semestersMap.values());

  const studentsInSemester = selectedSemester 
    ? students.filter(s => s.profiles?.semester_id === selectedSemester)
    : students;

  const allSections = Array.from(new Set(studentsInSemester.map(s => s.profiles?.section || 'Unassigned'))).sort();

  const filtered = studentsInSemester.filter(s => {
    const matchesSearch = s.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.subjects.subject_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSection = selectedSection ? (s.profiles?.section || 'Unassigned') === selectedSection : true;
    return matchesSearch && matchesSection;
  });

  return (
    <div className="space-y-6 fade-in">
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Faculty Dashboard</h1>
            <p className="text-muted-foreground">Manage student clearance and internal assessments.</p>
          </div>
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
        </div>
      </div>

      {/* ======================== CLEARANCE TAB ======================== */}
      {activeTab === 'clearance' && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading students...</div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No students assigned to your subjects yet.</div>
          ) : (
            <div className="flex flex-col">
              {/* Semester Tabs */}
              <div className="flex items-center overflow-x-auto border-b border-border p-2 gap-2 bg-secondary/10 scrollbar-hide">
                {allSemesters.length === 0 ? (
                  <span className="text-sm font-medium text-muted-foreground px-4 py-2">No active semesters</span>
                ) : allSemesters.map(sem => (
                  <button
                    key={sem.id}
                    onClick={() => {
                      setSelectedSemester(sem.id);
                      setSelectedSection(null);
                    }}
                    className={`px-6 py-3 rounded-xl font-medium whitespace-nowrap transition-all duration-200 ${
                      selectedSemester === sem.id
                        ? 'bg-amber-500 text-white shadow-md scale-100'
                        : 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {sem.name}
                  </button>
                ))}
              </div>

              {/* Section Tabs */}
              {selectedSemester && (
                <div className="flex items-center overflow-x-auto border-b border-border p-2 gap-2 bg-secondary/30 scrollbar-hide">
                  {allSections.map(section => (
                    <button
                      key={section}
                      onClick={() => setSelectedSection(section)}
                      className={`px-6 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                        selectedSection === section
                          ? 'bg-primary text-primary-foreground shadow-sm scale-100'
                          : 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      Section {section}
                    </button>
                  ))}
                </div>
              )}

              {/* CSV Actions Bar for Clearance */}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors border border-primary/30"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload CSV
                </button>
                <input ref={clearanceCsvRef} type="file" accept=".csv" className="hidden" onChange={handleAttendanceCSVUpload} />
                {csvUploadMsg && (
                  <span className={`text-xs font-medium ${csvUploadMsg.startsWith('Error') ? 'text-destructive' : 'text-emerald-600'}`}>
                    {csvUploadMsg}
                  </span>
                )}
              </div>
              
              {/* Table */}
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No students match your search in this section.</div>
              ) : (
                  <div className="overflow-x-auto p-4">
                    <div className="border border-border rounded-2xl overflow-hidden bg-card">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                            <th className="px-6 py-4 font-semibold">Student Name</th>
                            <th className="px-6 py-4 font-semibold">Roll No</th>
                            <th className="px-6 py-4 font-semibold">Subject</th>
                            <th className="px-6 py-4 font-semibold">Attendance %</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                            <th className="px-6 py-4 font-semibold text-right">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filtered.map(student => (
                            <tr key={student.id} className="hover:bg-secondary/20 transition-colors">
                              <td className="px-6 py-4 font-medium text-foreground">{student.profiles?.full_name || 'Unknown'}</td>
                              <td className="px-6 py-4 text-sm text-muted-foreground">{student.profiles?.roll_number || 'N/A'}</td>
                              <td className="px-6 py-4">
                                <div className="text-sm font-medium">{student.subjects.subject_name}</div>
                                <div className="text-xs text-muted-foreground">{student.subjects.subject_code}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number"
                                    min="0"
                                    max="100"
                                    className={`w-20 p-2 border rounded-xl text-sm bg-background transition-colors focus:ring-2 focus:ring-primary focus:outline-none ${
                                      (student.attendance_pct || 0) < 85 ? 'border-destructive/50 text-destructive' : 'border-emerald-500/50 text-emerald-600'
                                    }`}
                                    value={student.attendance_pct === null ? '' : student.attendance_pct}
                                    onChange={e => handleAttendanceChange(student.id, e.target.value)}
                                    onBlur={() => updateAttendance(student.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                                  />
                                  <span className="text-xs text-muted-foreground font-medium">Min 85%</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  student.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                  student.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                                  'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                }`}>
                                  {student.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right text-sm text-muted-foreground font-medium">
                                {student.remarks || '-'}
                              </td>
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
      )}

      {/* ======================== MANAGE IAs TAB ======================== */}
      {activeTab === 'manage-ia' && (
        <div className="space-y-6">
          {/* Subject Selector */}
          <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Select Subject
            </h2>
            {teacherSubjects.length === 0 ? (
              <p className="text-muted-foreground text-sm">No subjects assigned to you yet.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {teacherSubjects.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedSubjectId(sub.id)}
                    className={`px-5 py-3 rounded-2xl font-medium transition-all duration-200 border ${
                      selectedSubjectId === sub.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                        : 'bg-secondary/50 text-foreground border-border hover:bg-secondary hover:shadow-md'
                    }`}
                  >
                    <div className="text-sm font-bold">{sub.subject_code}</div>
                    <div className="text-xs opacity-80">{sub.subject_name}</div>
                    {sub.semesters && <div className="text-[10px] opacity-60 mt-1">{sub.semesters.name}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* IA Management Area */}
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
                        {iaCount} / {MAX_IAS_PER_SUBJECT} IA{iaCount !== 1 ? 's' : ''} recorded • {enrolledStudents.length} students enrolled
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={handleAddIA}
                        disabled={showNewIAForm || isIALimitReached}
                        className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        <Plus className="w-4 h-4" />
                        {isIALimitReached ? `Max ${MAX_IAS_PER_SUBJECT} IAs Reached` : `Add IA-${iaCount + 1}`}
                      </button>
                      {isIALimitReached && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Maximum of {MAX_IAS_PER_SUBJECT} IAs allowed per subject</p>
                      )}
                    </div>
                  </div>

                  {/* Success/Error message */}
                  {saveSuccess && (
                    <div className={`mb-4 p-4 rounded-xl text-sm font-medium border ${
                      saveSuccess.startsWith('Error')
                        ? 'bg-destructive/10 text-destructive border-destructive/20'
                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    }`}>
                      {saveSuccess}
                    </div>
                  )}

                  {/* New IA Form */}
                  {showNewIAForm && (
                    <div className="mb-6 border-2 border-primary/30 rounded-2xl overflow-hidden bg-primary/5">
                      <div className="bg-primary/10 px-6 py-4 border-b border-primary/20 flex flex-wrap justify-between items-center gap-3">
                        <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
                          <Users className="w-5 h-5 text-primary" />
                          IA-{iaCount + 1} — Mark Attendance
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {/* CSV actions */}
                          <button
                            onClick={downloadIATemplate}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors border border-border"
                          >
                            <Download className="w-3.5 h-3.5" />
                            CSV Template
                          </button>
                          <button
                            onClick={() => iaCsvRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-500/15 text-violet-600 rounded-lg hover:bg-violet-500/25 transition-colors border border-violet-500/30"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Upload CSV
                          </button>
                          <input ref={iaCsvRef} type="file" accept=".csv" className="hidden" onChange={handleIACSVUpload} />
                          <button
                            onClick={() => {
                              const allPresent: AttendanceMap = {};
                              enrolledStudents.forEach(s => { allPresent[s.student_id] = true; });
                              setNewIAAttendance(allPresent);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-600 rounded-lg hover:bg-emerald-500/30 transition-colors"
                          >
                            Mark All Present
                          </button>
                          <button
                            onClick={() => {
                              const allAbsent: AttendanceMap = {};
                              enrolledStudents.forEach(s => { allAbsent[s.student_id] = false; });
                              setNewIAAttendance(allAbsent);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-destructive/20 text-destructive rounded-lg hover:bg-destructive/30 transition-colors"
                          >
                            Mark All Absent
                          </button>
                        </div>
                      </div>
                      {iaCsvMsg && (
                        <div className={`mx-6 mt-3 p-3 rounded-xl text-xs font-medium border ${
                          iaCsvMsg.startsWith('Error') ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        }`}>
                          {iaCsvMsg}
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-secondary/30 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                              <th className="px-6 py-3 font-semibold">#</th>
                              <th className="px-6 py-3 font-semibold">Student Name</th>
                              <th className="px-6 py-3 font-semibold">Roll No</th>
                              <th className="px-6 py-3 font-semibold">Section</th>
                              <th className="px-6 py-3 font-semibold text-center">Attendance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {enrolledStudents.map((student, idx) => (
                              <tr key={student.student_id} className="hover:bg-secondary/10 transition-colors">
                                <td className="px-6 py-3 text-sm text-muted-foreground">{idx + 1}</td>
                                <td className="px-6 py-3 font-medium text-foreground">{student.profiles?.full_name || 'Unknown'}</td>
                                <td className="px-6 py-3 text-sm text-muted-foreground">{student.profiles?.roll_number || 'N/A'}</td>
                                <td className="px-6 py-3 text-sm text-muted-foreground">{student.profiles?.section || 'N/A'}</td>
                                <td className="px-6 py-3">
                                  <div className="flex items-center justify-center gap-4">
                                    <label className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all border-2 ${
                                      newIAAttendance[student.student_id] === true
                                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 shadow-md'
                                        : 'border-transparent hover:bg-emerald-500/5 text-muted-foreground'
                                    }`}>
                                      <input
                                        type="radio"
                                        name={`ia-${student.student_id}`}
                                        checked={newIAAttendance[student.student_id] === true}
                                        onChange={() => setNewIAAttendance(prev => ({ ...prev, [student.student_id]: true }))}
                                        className="accent-emerald-500"
                                      />
                                      <span className="text-sm font-semibold">Present</span>
                                    </label>
                                    <label className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all border-2 ${
                                      newIAAttendance[student.student_id] === false
                                        ? 'bg-destructive/15 border-destructive text-destructive shadow-md'
                                        : 'border-transparent hover:bg-destructive/5 text-muted-foreground'
                                    }`}>
                                      <input
                                        type="radio"
                                        name={`ia-${student.student_id}`}
                                        checked={newIAAttendance[student.student_id] === false}
                                        onChange={() => setNewIAAttendance(prev => ({ ...prev, [student.student_id]: false }))}
                                        className="accent-destructive"
                                      />
                                      <span className="text-sm font-semibold">Absent</span>
                                    </label>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-6 py-4 border-t border-primary/20 flex justify-end gap-3">
                        <button
                          onClick={() => { setShowNewIAForm(false); setIaCsvMsg(null); }}
                          className="px-5 py-2.5 text-sm font-medium text-muted-foreground bg-secondary rounded-xl hover:bg-secondary/80 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveIA}
                          disabled={savingIA}
                          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium transition-all shadow-md hover:shadow-lg hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          {savingIA ? 'Saving...' : `Save IA-${iaCount + 1}`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing IAs List */}
                  {iaNumbers.length === 0 && !showNewIAForm ? (
                    <div className="p-10 text-center">
                      <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <ClipboardList className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground font-medium">No Internal Assessments recorded yet.</p>
                      <p className="text-muted-foreground text-sm mt-1">Click "Add IA-1" to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {iaNumbers.map(iaNum => {
                        const records = iasByNumber[iaNum];
                        const presentCount = records.filter(r => r.is_present).length;
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
                                    <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2.5 py-1 rounded-full">
                                      {presentCount} Present
                                    </span>
                                    <span className="text-xs font-medium bg-destructive/10 text-destructive px-2.5 py-1 rounded-full">
                                      {records.length - presentCount} Absent
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                            </button>
                            
                            {isExpanded && (
                              <div className="border-t border-border">
                                {editingIA === iaNum ? (
                                  <div className="p-4 bg-primary/5">
                                    <div className="flex justify-between items-center mb-4">
                                      <h5 className="font-semibold text-primary">Editing IA-{iaNum} Attendance</h5>
                                      <div className="flex gap-2">
                                        <button 
                                          onClick={() => setEditingIA(null)}
                                          className="px-3 py-1.5 text-xs font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                                        >
                                          Cancel
                                        </button>
                                        <button 
                                          onClick={() => handleEditIASave(iaNum)}
                                          disabled={savingIA}
                                          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                          {savingIA ? 'Saving...' : 'Save Changes'}
                                        </button>
                                      </div>
                                    </div>
                                    <table className="w-full text-left border-collapse bg-card rounded-xl overflow-hidden shadow-sm">
                                      <thead>
                                        <tr className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wider">
                                          <th className="px-4 py-3 font-semibold">Student Name</th>
                                          <th className="px-4 py-3 font-semibold text-center">Attendance</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border">
                                        {records.map((record) => (
                                          <tr key={record.student_id} className="hover:bg-secondary/10 transition-colors">
                                            <td className="px-4 py-3 font-medium text-sm text-foreground">{record.profiles?.full_name || 'Unknown'}</td>
                                            <td className="px-4 py-3">
                                              <div className="flex items-center justify-center gap-2">
                                                <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all border ${
                                                  editAttendanceMap[record.student_id] === true
                                                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-600 shadow-sm'
                                                    : 'border-transparent hover:bg-emerald-500/5 text-muted-foreground'
                                                }`}>
                                                  <input
                                                    type="radio"
                                                    name={`edit-ia-${iaNum}-${record.student_id}`}
                                                    checked={editAttendanceMap[record.student_id] === true}
                                                    onChange={() => setEditAttendanceMap(prev => ({ ...prev, [record.student_id]: true }))}
                                                    className="hidden"
                                                  />
                                                  <span className="text-xs font-semibold">Present</span>
                                                </label>
                                                <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all border ${
                                                  editAttendanceMap[record.student_id] === false
                                                    ? 'bg-destructive/15 border-destructive text-destructive shadow-sm'
                                                    : 'border-transparent hover:bg-destructive/5 text-muted-foreground'
                                                }`}>
                                                  <input
                                                    type="radio"
                                                    name={`edit-ia-${iaNum}-${record.student_id}`}
                                                    checked={editAttendanceMap[record.student_id] === false}
                                                    onChange={() => setEditAttendanceMap(prev => ({ ...prev, [record.student_id]: false }))}
                                                    className="hidden"
                                                  />
                                                  <span className="text-xs font-semibold">Absent</span>
                                                </label>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex justify-end p-2 bg-secondary/10 border-b border-border">
                                      <button 
                                        onClick={() => {
                                          const map: AttendanceMap = {};
                                          records.forEach(r => { map[r.student_id] = r.is_present; });
                                          setEditAttendanceMap(map);
                                          setEditingIA(iaNum);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors border border-primary/30"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                        Edit Attendance Mode
                                      </button>
                                    </div>
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
                                          <tr key={record.id} className="hover:bg-secondary/10 transition-colors">
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
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
