import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import { getFacultyPendingStudents, markFacultySubjectStatus } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Search } from 'lucide-react';
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
  profiles: { full_name: string; section?: string | null; semester_id?: string | null; semesters?: { name: string } | null } | null;
};

export default function FacultyDashboard() {
  const { user } = useAuth();
  const [students, setStudents] = useState<SubjectEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
      
      const channel = supabase.channel('faculty-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subject_enrollment', filter: `teacher_id=eq.${user.id}` }, () => fetchData())
        .subscribe();
      return () => { supabase.removeChannel(channel); }
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getFacultyPendingStudents(user!.id);
      const typedData = data as unknown as SubjectEnrollment[];
      setStudents(typedData);
      
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
      
      // Auto-select first section based on the prevailing semester if missing
      const activeSem = selectedSemester || initialSem;
      if (activeSem) {
        const secs = Array.from(new Set(typedData.filter(s => s.profiles?.semester_id === activeSem).map(s => s.profiles?.section || 'Unassigned'))).sort();
        if (secs.length > 0 && !selectedSection) {
          setSelectedSection(secs[0] as string);
        }
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAttendanceChange = (id: string, pctString: string) => {
    const pct = parseInt(pctString);
    if (isNaN(pct) && pctString !== '') return;
    setStudents(prev => prev.map(s => s.id === id ? { ...s, attendance_pct: isNaN(pct) ? null : pct } : s));
  };

  const updateAttendance = async (id: string) => {
    try {
      const enrollment = students.find(s => s.id === id);
      if (!enrollment) return;
      
      const pct = enrollment.attendance_pct || 0;
      const status = pct >= 85 ? 'completed' : 'rejected';
      const remarks = pct >= 85 ? 'Cleared by Faculty' : 'Low Attendance (<85%)';

      await markFacultySubjectStatus(id, status, pct, remarks);
      setStudents(prev => prev.map(s => s.id === id ? { ...s, status, remarks } : s));
    } catch (err: any) {
      console.error("Attendance update error:", err);
    }
  };

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
            <p className="text-muted-foreground">Manage student clearance and attendance for your subjects.</p>
          </div>
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
        </div>
      </div>

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
                    setSelectedSection(null); // Reset section when changing semester
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
    </div>
  );
}
