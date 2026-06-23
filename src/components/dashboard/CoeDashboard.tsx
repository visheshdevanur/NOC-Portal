import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/useAuth';
import {
  getAllDepartments,
  getSemestersByDepartment,
  getSubjectsForDeptSem,
  getEnrolledStudents,
  getIAAttendance,
  saveIAAttendanceCOE,
  getIACompletionStatus,
} from '../../lib/api/coe';
import {
  GraduationCap, Building2, BookOpen, ClipboardCheck,
  ChevronRight, ChevronLeft, Check, X, Search,
  Save, Users, Loader2,
} from 'lucide-react';

type Department = { id: string; name: string };
type Semester = { id: string; name: string };
type Subject = { id: string; subject_name: string; subject_code: string };
type EnrolledStudent = { student_id: string; profiles: any };
type Step = 'department' | 'semester' | 'subject' | 'ia' | 'students';

export default function CoeDashboard() {
  const { user } = useAuth();

  // Navigation state
  const [step, setStep] = useState<Step>('department');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);

  // Selection state
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedSem, setSelectedSem] = useState<Semester | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedIA, setSelectedIA] = useState<number>(1);

  // Attendance state
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // IA completion tracking: { subject_id: [1, 2, 3] }
  const [iaStatus, setIaStatus] = useState<Record<string, number[]>>({});

  // Loading states
  const [loading, setLoading] = useState(false);

  // Fetch departments on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const depts = await getAllDepartments();
        setDepartments(depts);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  // Fetch subjects when dept + sem selected, then fetch IA completion status
  const fetchSubjects = useCallback(async (deptId: string, semId: string) => {
    setLoading(true);
    try {
      const subs = await getSubjectsForDeptSem(deptId, semId);
      setSubjects(subs);
      // Fetch IA completion status for all subjects
      if (subs.length > 0) {
        try {
          const status = await getIACompletionStatus(subs.map((s: Subject) => s.id));
          setIaStatus(status);
        } catch (err) { console.error('Failed to fetch IA status:', err); }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  // Fetch students + existing attendance when subject + IA selected
  const fetchStudentsAndAttendance = useCallback(async (subjectId: string, iaNumber: number) => {
    setLoading(true);
    try {
      const [enrolled, existing] = await Promise.all([
        getEnrolledStudents(subjectId),
        getIAAttendance(subjectId, iaNumber),
      ]);
      setStudents(enrolled as EnrolledStudent[]);

      // Build attendance map: default all Present, then apply existing records
      const map: Record<string, boolean> = {};
      (enrolled as EnrolledStudent[]).forEach((s: any) => { map[s.student_id] = true; });
      (existing || []).forEach((r: any) => { map[r.student_id] = r.is_present; });
      setAttendance(map);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  // Step handlers
  const selectDepartment = async (dept: Department) => {
    setSelectedDept(dept);
    setSelectedSem(null);
    setSelectedSubject(null);
    setLoading(true);
    try {
      const sems = await getSemestersByDepartment(dept.id);
      setSemesters(sems);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
    setStep('semester');
  };

  const selectSemester = (sem: Semester) => {
    setSelectedSem(sem);
    setSelectedSubject(null);
    fetchSubjects(selectedDept!.id, sem.id);
    setStep('subject');
  };

  const selectSubject = (sub: Subject) => {
    setSelectedSubject(sub);
    // Refresh IA status for this subject if not already loaded
    if (!iaStatus[sub.id]) {
      getIACompletionStatus([sub.id]).then(status => {
        setIaStatus(prev => ({ ...prev, ...status }));
      }).catch(console.error);
    }
    setStep('ia');
  };

  const selectIA = (iaNum: number) => {
    setSelectedIA(iaNum);
    setSearchTerm('');
    fetchStudentsAndAttendance(selectedSubject!.id, iaNum);
    setStep('students');
  };

  const goBack = () => {
    setSaveMsg(null);
    setSearchTerm('');
    if (step === 'students') setStep('ia');
    else if (step === 'ia') setStep('subject');
    else if (step === 'subject') setStep('semester');
    else if (step === 'semester') setStep('department');
  };

  // Toggle attendance
  const toggleAttendance = (studentId: string) => {
    setAttendance(prev => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  // Save attendance
  const handleSave = async () => {
    if (!user || !selectedSubject) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const records = Object.entries(attendance).map(([studentId, isPresent]) => ({
        student_id: studentId,
        subject_id: selectedSubject.id,
        teacher_id: user.id,
        ia_number: selectedIA,
        is_present: isPresent,
      }));
      await saveIAAttendanceCOE(records);
      setSaveMsg({ type: 'ok', text: `✅ IA${selectedIA} attendance saved for ${records.length} students` });
      // Update IA completion status after saving
      if (selectedSubject) {
        setIaStatus(prev => {
          const current = prev[selectedSubject.id] || [];
          if (!current.includes(selectedIA)) {
            return { ...prev, [selectedSubject.id]: [...current, selectedIA] };
          }
          return prev;
        });
      }
    } catch (err: any) {
      setSaveMsg({ type: 'err', text: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  // Filtered students by search
  const filteredStudents = students.filter(s => {
    if (!searchTerm.trim()) return true;
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    const term = searchTerm.toLowerCase();
    return (
      (profile?.roll_number || '').toLowerCase().includes(term) ||
      (profile?.full_name || '').toLowerCase().includes(term)
    );
  });

  const absentCount = Object.values(attendance).filter(v => !v).length;
  const presentCount = Object.values(attendance).filter(v => v).length;

  // Breadcrumb
  const breadcrumb = () => {
    const parts: string[] = [];
    if (selectedDept) parts.push(selectedDept.name);
    if (selectedSem) parts.push(selectedSem.name);
    if (selectedSubject) parts.push(`${selectedSubject.subject_name} (${selectedSubject.subject_code})`);
    if (step === 'students') parts.push(`IA${selectedIA}`);
    return parts;
  };

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">COE Dashboard</h1>
            <p className="text-sm text-muted-foreground">IA Attendance Management</p>
          </div>
        </div>
      </div>

      {/* Breadcrumb */}
      {step !== 'department' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors bg-primary/5 px-3 py-1.5 rounded-lg"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {breadcrumb().map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                <span className={i === breadcrumb().length - 1 ? 'font-semibold text-foreground' : ''}>{part}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {/* STEP 1: Department */}
      {!loading && step === 'department' && (
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Select Department
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {departments.map(dept => (
              <button
                key={dept.id}
                onClick={() => selectDepartment(dept)}
                className="group flex items-center justify-between p-4 bg-secondary/50 hover:bg-primary/10 border border-border hover:border-primary/30 rounded-xl transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-semibold text-sm text-foreground">{dept.name}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
            {departments.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full py-8 text-center">No departments found</p>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Semester */}
      {!loading && step === 'semester' && (
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500" /> Select Semester
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {semesters.map(sem => (
              <button
                key={sem.id}
                onClick={() => selectSemester(sem)}
                className="group flex items-center justify-between p-4 bg-secondary/50 hover:bg-amber-500/10 border border-border hover:border-amber-500/30 rounded-xl transition-all"
              >
                <span className="font-semibold text-sm text-foreground">{sem.name}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: Subject */}
      {!loading && step === 'subject' && (
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-violet-500" /> Select Subject
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subjects.map(sub => {
              const completedIAs = iaStatus[sub.id] || [];
              const allComplete = completedIAs.length >= 3 && [1, 2, 3].every(n => completedIAs.includes(n));
              return (
                <button
                  key={sub.id}
                  onClick={() => selectSubject(sub)}
                  className={`group flex items-center justify-between p-4 border rounded-xl transition-all text-left ${
                    allComplete
                      ? 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10'
                      : 'bg-secondary/50 border-border hover:bg-violet-500/10 hover:border-violet-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      allComplete ? 'bg-emerald-500' : 'bg-red-400'
                    }`} />
                    <div>
                      <div className="font-semibold text-sm text-foreground">{sub.subject_name}</div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-muted-foreground font-mono">{sub.subject_code}</code>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          allComplete
                            ? 'bg-emerald-500/15 text-emerald-600'
                            : 'bg-red-500/10 text-red-500'
                        }`}>
                          {completedIAs.length}/3 IAs
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 transition-colors ${
                    allComplete
                      ? 'text-emerald-500'
                      : 'text-muted-foreground group-hover:text-violet-500'
                  }`} />
                </button>
              );
            })}
            {subjects.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full py-8 text-center">No subjects found for this department and semester</p>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: IA Selection */}
      {!loading && step === 'ia' && (
        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-500" /> Select Internal Assessment
          </h2>
          <div className="grid grid-cols-3 gap-4 max-w-md">
            {[1, 2, 3].map(num => {
              const isSaved = selectedSubject && (iaStatus[selectedSubject.id] || []).includes(num);
              return (
                <button
                  key={num}
                  onClick={() => selectIA(num)}
                  className={`group flex flex-col items-center gap-2 p-6 border rounded-xl transition-all ${
                    isSaved
                      ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
                      : 'bg-secondary/50 border-border hover:bg-red-500/5 hover:border-red-400/30'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    isSaved
                      ? 'bg-emerald-500/20'
                      : 'bg-red-400/10 group-hover:bg-red-400/15'
                  }`}>
                    <span className={`text-lg font-bold ${
                      isSaved ? 'text-emerald-600' : 'text-red-500'
                    }`}>IA{num}</span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Internal Assessment {num}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isSaved
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-red-500/10 text-red-500'
                  }`}>
                    {isSaved ? '✓ Saved' : '✗ Not Saved'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 5: Student Attendance */}
      {!loading && step === 'students' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-xl p-4 border border-border text-center">
              <Users className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-xl font-bold text-foreground">{students.length}</div>
              <div className="text-xs text-muted-foreground font-medium">Total</div>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border text-center">
              <Check className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <div className="text-xl font-bold text-emerald-600">{presentCount}</div>
              <div className="text-xs text-muted-foreground font-medium">Present</div>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border text-center">
              <X className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <div className="text-xl font-bold text-red-600">{absentCount}</div>
              <div className="text-xs text-muted-foreground font-medium">Absent</div>
            </div>
          </div>

          {/* Student List */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground text-sm">
                  Student Attendance — IA{selectedIA}
                </h3>
                <span className="text-xs text-muted-foreground">Click to toggle Present / Absent</span>
              </div>
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by USN or name..."
                  className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                />
              </div>
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {filteredStudents.map((s, idx) => {
                const isPresent = attendance[s.student_id] ?? true;
                const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
                return (
                  <button
                    key={s.student_id}
                    onClick={() => toggleAttendance(s.student_id)}
                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors text-left ${
                      isPresent ? 'hover:bg-emerald-500/5' : 'bg-red-500/5 hover:bg-red-500/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-8">{idx + 1}</span>
                      <div>
                        <div className="text-sm font-medium text-foreground">{profile?.full_name || 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{profile?.roll_number || '—'}</div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                      isPresent
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-red-500/15 text-red-600'
                    }`}>
                      {isPresent ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {isPresent ? 'Present' : 'Absent'}
                    </div>
                  </button>
                );
              })}
              {filteredStudents.length === 0 && students.length > 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No students matching "{searchTerm}"
                </div>
              )}
              {students.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No students enrolled in this subject
                </div>
              )}
            </div>
          </div>

          {/* Save */}
          {students.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
              {saveMsg && (
                <span className={`text-sm font-medium ${saveMsg.type === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}>
                  {saveMsg.text}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
