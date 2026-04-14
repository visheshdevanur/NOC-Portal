import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import {
  getUsersByDeptAndRoles,
  getSubjectsByDepartment, createSubject, deleteSubject, getDepartmentSections,
  assignTeacherToSection, updateSubjectAPI, getDepartmentById, getStaffAttendanceFines, overrideAttendanceFine, getSemestersByDepartment, createSemester, updateUserAPI
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import {
  X, Search, BookOpen, Users, UserPlus,
  Plus, Trash2, Settings, GraduationCap, Link2, FileWarning
} from 'lucide-react';
import { getFriendlyErrorMessage } from '../../lib/errorHandler';

type UserProfile = {
  id: string;
  full_name: string;
  role: string;
  email?: string;
  department_id: string | null;
  semester_id?: string;
  section: string | null;
  roll_number?: string | null;
  created_at: string;
};

type Subject = {
  id: string;
  subject_name: string;
  subject_code: string;
  department_id?: string;
  semester_id?: string;
  departments?: { name: string } | null;
  semesters?: { name: string } | null;
};

type TabType = 'users' | 'subjects' | 'sections' | 'attendances' | 'semesters' | 'dues';

type Semester = {
  id: string;
  name: string;
  department_id: string;
};

export default function StaffDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [deptName, setDeptName] = useState<string>('');

  // Users State
  const [departmentUsers, setDepartmentUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'teacher', section: '', semester_id: '', roll_number: '', teacher_id: '' });
  const [userCreating, setUserCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'all' | 'teacher' | 'student'>('all');

  // Dues state
  const [departmentDues, setDepartmentDues] = useState<any[]>([]);
  const [loadingDues, setLoadingDues] = useState(false);

  // Subjects State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ subject_name: '', subject_code: '', semester_id: '' });
  const [subjectCreating, setSubjectCreating] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [subjectSuccess, setSubjectSuccess] = useState<string | null>(null);
  const [uploadingSubjectCSV, setUploadingSubjectCSV] = useState(false);

  // Semesters State
  const [semestersList, setSemestersList] = useState<Semester[]>([]);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [showCreateSemester, setShowCreateSemester] = useState(false);
  const [newSemesterName, setNewSemesterName] = useState('');
  const [semesterCreating, setSemesterCreating] = useState(false);
  const [semesterError, setSemesterError] = useState<string | null>(null);
  const [semesterSuccess, setSemesterSuccess] = useState<string | null>(null);

  // Section Assignment State
  const [sections, setSections] = useState<string[]>([]);
  const [deptSubjects, setDeptSubjects] = useState<Subject[]>([]);
  const [deptTeachers, setDeptTeachers] = useState<any[]>([]);
  const [selectedSemesterForAssign, setSelectedSemesterForAssign] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sectionSuccess, setSectionSuccess] = useState<string | null>(null);

  // Attendances State
  const [attendanceFines, setAttendanceFines] = useState<any[]>([]);
  const [loadingAttendances, setLoadingAttendances] = useState(false);

  // Search states for tabs
  const [searchAttendances, setSearchAttendances] = useState('');
  const [searchDues, setSearchDues] = useState('');
  const [searchSemesters, setSearchSemesters] = useState('');
  const [searchSubjects, setSearchSubjects] = useState('');

  useEffect(() => {
    if (profile?.department_id) {
      fetchDeptName();
      fetchData();

      const channel = supabase.channel('staff-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          if (activeTab === 'users') fetchUsers();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); }
    }
  }, [profile]);

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'sections') { fetchUsers(); fetchSemesters(); }
    if (activeTab === 'sections') fetchSectionData();
    if (activeTab === 'subjects') fetchSubjects();
    if (activeTab === 'attendances') fetchAttendances();
    if (activeTab === 'semesters') fetchSemesters();
    if (activeTab === 'dues') fetchDues();
  }, [activeTab, profile?.department_id]);

  const fetchDues = async () => {
    if (!profile?.department_id) return;
    setLoadingDues(true);
    try {
      const data = await import('../../lib/api').then(m => m.getStaffStudentDues(profile.department_id!));
      setDepartmentDues(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingDues(false); }
  };

  const handleApproveDue = async (dueId: string) => {
    if (!confirm("Approve this student's college fee due?")) return;
    try {
      await import('../../lib/api').then(m => m.markStudentDues(dueId, 'completed', 0));
      fetchDues();
    } catch (err: any) {
      alert("Failed to approve due: " + getFriendlyErrorMessage(err));
    }
  };

  const fetchDeptName = async () => {
    if (!profile?.department_id) return;
    try {
      const dept = await getDepartmentById(profile.department_id);
      setDeptName(dept?.name || profile.department_id);
    } catch { setDeptName(profile.department_id); }
  };

  const fetchData = async () => {
    // Legacy Dues fetch disabled
  };

  // ==================== ATTENDANCES ======================
  const fetchAttendances = async () => {
    if (!profile?.department_id) return;
    setLoadingAttendances(true);
    try {
      const data = await getStaffAttendanceFines(profile.department_id);
      setAttendanceFines(data);
    } catch (err) { console.error(err); }
    finally { setLoadingAttendances(false); }
  };

  const handleApproveFine = async (enrollmentId: string) => {
    if (!confirm("Are you sure you want to approve this student (Override Faculty Rejection)?")) return;
    try {
      await overrideAttendanceFine(enrollmentId);
      fetchAttendances();
    } catch (err: any) {
      alert("Failed to override: " + getFriendlyErrorMessage(err));
    }
  };

  // ==================== USERS ======================
  const fetchUsers = async () => {
    if (!profile?.department_id) return;
    setLoadingUsers(true);
    try {
      const data = await getUsersByDeptAndRoles(profile.department_id, ['teacher', 'faculty', 'student']);
      setDepartmentUsers(data as UserProfile[]);
    } catch (err) { console.error(err); }
    finally { setLoadingUsers(false); }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "email,password,full_name,role,semester_id,section,roll_number\n" +
      "john@college.edu,SecurePass123,John Doe,student,,A,21CS001\n" +
      "jane.smith@college.edu,TeacherPass123,Jane Smith,teacher,,,";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Staff_Mass_Upload_Template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile?.department_id) return;
    
    setUploadingCSV(true);
    setUserError(null);
    setUserSuccess(null);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      if (lines.length < 2) throw new Error("CSV file is empty or missing data rows.");
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const required = ['email', 'password', 'full_name', 'role'];
      for (const req of required) {
        if (!headers.includes(req)) throw new Error(`Missing required CSV column: ${req}`);
      }

      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co',
        import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key',
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      );

      let successCount = 0;
      let errorCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',').map(c => c.trim());
        const getVal = (colName: string) => columns[headers.indexOf(colName)] || '';
        
        const email = getVal('email');
        const password = getVal('password');
        const full_name = getVal('full_name');
        const role = getVal('role').toLowerCase();
        
        if (!email || !password || !full_name || !['student', 'teacher'].includes(role)) {
          errorCount++;
          continue; // Skip invalid row dynamically
        }

        const { data: authData, error: authError } = await tempSupabase.auth.signUp({
          email, password
        });
        
        if (authError || !authData.user) {
          errorCount++;
          continue;
        }

        let profileData: any = {
          id: authData.user.id,
          full_name,
          role,
          department_id: profile.department_id,
        };

        if (role === 'student') {
          const section = getVal('section');
          const sem = getVal('semester_id');
          const roll = getVal('roll_number');
          if (section) profileData.section = section.toUpperCase();
          if (sem) profileData.semester_id = sem;
          if (roll) profileData.roll_number = roll;
        }

        await supabase.from('profiles').upsert(profileData);
        successCount++;
      }
      
      if (errorCount > 0) {
        setUserError(`Uploaded ${successCount} users. Encountered errors on ${errorCount} rows.`);
      } else {
        setUserSuccess(`Successfully mass uploaded ${successCount} users!`);
      }
      fetchUsers();
    } catch (err: any) {
      setUserError(getFriendlyErrorMessage(err));
    } finally {
      setUploadingCSV(false);
      // reset file input
      event.target.value = '';
    }
  };

  const handleCreateUser = async () => {
    if (!profile?.department_id) return;
    setUserCreating(true);
    setUserError(null);
    setUserSuccess(null);

    if (!newUser.email || !newUser.password || !newUser.full_name) {
      setUserError('All fields are required.');
      setUserCreating(false);
      return;
    }
    if (newUser.role === 'student' && !newUser.section) {
      setUserError('Section is required for students.');
      setUserCreating(false);
      return;
    }

    try {
      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co',
        import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key',
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      );

      const { data: authData, error: authError } = await tempSupabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      const profileData: any = {
        id: authData.user.id,
        full_name: newUser.full_name,
        role: newUser.role,
        department_id: profile.department_id,
      };
      if (newUser.role === 'student') {
        if (newUser.section) profileData.section = newUser.section.toUpperCase();
        if (newUser.semester_id) profileData.semester_id = newUser.semester_id;
        if (newUser.roll_number) profileData.roll_number = newUser.roll_number;
      }
      if (newUser.role === 'teacher' && newUser.teacher_id) {
        profileData.roll_number = newUser.teacher_id;
      }

      const { error: profileError } = await supabase.from('profiles').upsert(profileData);
      if (profileError) throw profileError;

      setUserSuccess(`${newUser.role === 'student' ? 'Student' : 'Teacher'} "${newUser.full_name}" created!`);
      setNewUser({ email: '', password: '', full_name: '', role: 'teacher', section: '', semester_id: '', roll_number: '', teacher_id: '' });
      setShowCreateUser(false);
      fetchUsers();
    } catch (err: any) {
      setUserError(getFriendlyErrorMessage(err));
    } finally {
      setUserCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to delete "${userName}"?`)) return;
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      setUserSuccess(`"${userName}" deleted.`);
      fetchUsers();
    } catch (err: any) {
      setUserError(getFriendlyErrorMessage(err));
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setUserCreating(true);
    setUserError(null);

    try {
      const updates: any = {
        full_name: editingUser.full_name,
      };
      if (editingUser.role === 'student') {
        updates.section = editingUser.section ? editingUser.section.toUpperCase() : null;
        updates.semester_id = editingUser.semester_id || null;
        updates.roll_number = editingUser.roll_number || null;
      }

      await updateUserAPI(editingUser.id, updates);

      // Call API explicitly if email was provided and it differs (for simplicity, we always update it if provided to the new value)
      if (editingUser.email?.trim()) {
        const { adminUpdateUserCredentials } = await import('../../lib/api');
        await adminUpdateUserCredentials(editingUser.id, editingUser.email.trim());
      }

      setUserSuccess(`${editingUser.role === 'student' ? 'Student' : 'Teacher'} "${editingUser.full_name}" updated!`);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setUserError(getFriendlyErrorMessage(err));
    } finally {
      setUserCreating(false);
    }
  };

  const downloadSubjectTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "subject_code,subject_name,semester_name\n" +
      "CS101,Introduction to Computer Science,Semester 1\n" +
      "MA202,Calculus II,Semester 2";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Staff_Mass_Subject_Upload_Template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSubjectFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile?.department_id) return;
    
    setUploadingSubjectCSV(true);
    setSubjectError(null);
    setSubjectSuccess(null);
    
    try {
      const text = await file.text();
      // Basic CSV parse handling standard quotes simply (if needed). Assuming standard comma separated here for simplicity based on template
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      if (lines.length < 2) throw new Error("CSV file is empty or missing data rows.");
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const required = ['subject_code', 'subject_name', 'semester_name'];
      for (const req of required) {
        if (!headers.includes(req)) throw new Error(`Missing required CSV column: ${req}`);
      }

      // Fetch fresh semesters directly to ensure accuracy
      const fetchedSemesters = await import('../../lib/api').then(m => m.getSemestersByDepartment(profile.department_id!));
      
      let successCount = 0;
      let errorCount = 0;

      for (let i = 1; i < lines.length; i++) {
        // Parse simple CSV row
        const columns: string[] = [];
        let curr = '';
        let inQuotes = false;
        for (let char of lines[i]) {
          if (char === '"' && inQuotes) inQuotes = false;
          else if (char === '"' && !inQuotes) inQuotes = true;
          else if (char === ',' && !inQuotes) { columns.push(curr); curr = ''; }
          else curr += char;
        }
        columns.push(curr);
        
        const getVal = (colName: string) => (columns[headers.indexOf(colName)] || '').trim();
        
        const subject_code = getVal('subject_code').toUpperCase();
        const subject_name = getVal('subject_name');
        const semester_name = getVal('semester_name');
        
        if (!subject_code || !subject_name || !semester_name) {
          errorCount++;
          continue; 
        }

        const sem = fetchedSemesters.find(s => s.name.toLowerCase() === semester_name.toLowerCase());
        if (!sem) {
          errorCount++;
          continue; // Target semester not found
        }

        const subjectData = {
          subject_code,
          subject_name,
          semester_id: sem.id,
          department_id: profile.department_id,
        };

        const { error } = await supabase.from('subjects').insert(subjectData);
        if (error) { 
           errorCount++;
        } else {
           successCount++;
        }
      }
      
      if (errorCount > 0) {
        setSubjectError(`Uploaded ${successCount} subjects. Encountered errors on ${errorCount} rows (e.g. invalid semester or duplicate codes).`);
      } else {
        setSubjectSuccess(`Successfully mass uploaded ${successCount} subjects!`);
      }
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(getFriendlyErrorMessage(err));
    } finally {
      setUploadingSubjectCSV(false);
      event.target.value = '';
    }
  };

  // ==================== SUBJECTS ======================
  const fetchSubjects = async () => {
    if (!profile?.department_id) return;
    setLoadingSubjects(true);
    try {
      const data = await getSubjectsByDepartment(profile.department_id);
      setSubjects(data as Subject[]);
    } catch (err) { console.error(err); }
    finally { setLoadingSubjects(false); }
  };

  const handleCreateSubject = async () => {
    setSubjectCreating(true);
    setSubjectError(null);
    setSubjectSuccess(null);

    if (!newSubject.subject_name || !newSubject.subject_code || !newSubject.semester_id) {
      setSubjectError('Subject name, code, and semester are required.');
      setSubjectCreating(false);
      return;
    }

    try {
      await createSubject({
        subject_name: newSubject.subject_name,
        subject_code: newSubject.subject_code.toUpperCase(),
        department_id: profile!.department_id!,
        semester_id: newSubject.semester_id
      });
      setSubjectSuccess(`Subject "${newSubject.subject_name}" created!`);
      setNewSubject({ subject_name: '', subject_code: '', semester_id: '' });
      setShowCreateSubject(false);
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(getFriendlyErrorMessage(err));
    } finally {
      setSubjectCreating(false);
    }
  };

  const handleUpdateSubject = async () => {
    if (!editingSubject) return;
    setSubjectCreating(true);
    setSubjectError(null);

    try {
      await updateSubjectAPI(editingSubject.id, {
        subject_name: editingSubject.subject_name,
        subject_code: editingSubject.subject_code.toUpperCase(),
      });
      setSubjectSuccess(`Subject "${editingSubject.subject_name}" updated!`);
      setEditingSubject(null);
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(getFriendlyErrorMessage(err));
    } finally {
      setSubjectCreating(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string, name: string) => {
    if (!confirm(`Delete subject "${name}"?`)) return;
    try {
      await deleteSubject(subjectId);
      setSubjectSuccess(`"${name}" deleted.`);
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(getFriendlyErrorMessage(err));
    }
  };

  // ==================== SEMESTERS ======================
  const fetchSemesters = async () => {
    if (!profile?.department_id) return;
    setLoadingSemesters(true);
    try {
      const data = await getSemestersByDepartment(profile.department_id);
      setSemestersList(data);
    } catch (err) { console.error(err); }
    finally { setLoadingSemesters(false); }
  };

  const handleCreateSemester = async () => {
    if (!newSemesterName.trim()) {
      setSemesterError('Semester name is required');
      return;
    }
    setSemesterCreating(true);
    setSemesterError(null);
    setSemesterSuccess(null);
    try {
      await createSemester(newSemesterName, profile!.department_id!);
      setSemesterSuccess(`Semester "${newSemesterName}" created!`);
      setNewSemesterName('');
      setShowCreateSemester(false);
      fetchSemesters();
    } catch (err: any) {
      setSemesterError(getFriendlyErrorMessage(err));
    } finally {
      setSemesterCreating(false);
    }
  };

  // ==================== SECTION ASSIGN ======================
  const fetchSectionData = async () => {
    if (!profile?.department_id) return;
    try {
      const [secs, subs, teachers] = await Promise.all([
        getDepartmentSections(profile.department_id),
        getSubjectsByDepartment(profile.department_id),
        getUsersByDeptAndRoles(profile.department_id, ['teacher', 'faculty']),
      ]);
      setSections(secs);
      setDeptSubjects(subs as Subject[]);
      setDeptTeachers(teachers);
    } catch (err) { console.error(err); }
  };

  const handleSectionAssign = async () => {
    if (!selectedSemesterForAssign || !selectedSection || !selectedSubject || !selectedTeacher) {
      setSectionError('Please select a semester, section, subject, and teacher.');
      return;
    }
    setAssigning(true);
    setSectionError(null);
    setSectionSuccess(null);
    try {
      const result = await assignTeacherToSection(selectedSubject, selectedSection, selectedTeacher, selectedSemesterForAssign);
      const teacherName = deptTeachers.find(t => t.id === selectedTeacher)?.full_name || 'Teacher';
      setSectionSuccess(`Section "${selectedSection}" assigned to ${teacherName} for the selected subject. ${result?.length || 0} enrollments updated.`);
      setSelectedSection('');
      setSelectedSubject('');
      setSelectedTeacher('');
    } catch (err: any) {
      setSectionError(getFriendlyErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  const filteredUsers = departmentUsers.filter(u => {
    // Role filter
    if (roleFilter === 'teacher' && u.role !== 'teacher' && u.role !== 'faculty') return false;
    if (roleFilter === 'student' && u.role !== 'student') return false;
    // Text search
    return (
      u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) ||
      u.role?.toLowerCase().includes(searchUsers.toLowerCase()) ||
      u.roll_number?.toLowerCase().includes(searchUsers.toLowerCase())
    );
  });

  const roleColors: Record<string, string> = {
    student: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    faculty: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    teacher: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    staff: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'attendances', label: 'Attendance Fines', icon: <FileWarning className="w-4 h-4 text-destructive" /> },
    { id: 'semesters', label: 'Semesters', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'sections', label: 'Section Assign', icon: <Link2 className="w-4 h-4" /> },
    { id: 'dues', label: 'College Dues', icon: <FileWarning className="w-4 h-4 text-amber-500" /> },
  ];

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
              <GraduationCap className="w-8 h-8 mr-3 text-amber-500" />
              {profile?.full_name} — {deptName}
            </h1>
            <p className="text-muted-foreground">Manage users, subjects, and teacher assignments.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>


      {/* ========= ATTENDANCES TAB ========= */}
      {activeTab === 'attendances' && (
        <div className="space-y-4">
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
                        <th className="p-4 font-semibold">Section</th>
                        <th className="p-4 font-semibold">Subject</th>
                        <th className="p-4 font-semibold text-center">Attendance %</th>
                        <th className="p-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(item => (
                        <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-4 font-medium text-foreground">{item.profiles?.full_name}</td>
                          <td className="p-4"><span className="px-2 py-1 bg-secondary rounded-md text-xs font-medium">{item.profiles?.section || 'None'}</span></td>
                          <td className="p-4">
                            <div className="text-sm font-medium">{item.subjects?.subject_name}</div>
                            <div className="text-xs text-muted-foreground">{item.subjects?.subject_code}</div>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-destructive font-bold">{item.attendance_pct}%</span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleApproveFine(item.id)}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
                            >
                              Approve (Fine Paid)
                            </button>
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
      )}

      {/* ========= USERS TAB ========= */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {userSuccess && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center">
              <span>✓ {userSuccess}</span>
              <button onClick={() => setUserSuccess(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="relative flex-1 w-full md:max-w-xs">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search teachers/students..."
                className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
                value={searchUsers}
                onChange={e => setSearchUsers(e.target.value)}
              />
            </div>
            <select
              className="px-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-medium"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'all' | 'teacher' | 'student')}
            >
              <option value="all">All Users</option>
              <option value="teacher">Teachers Only</option>
              <option value="student">Students Only</option>
            </select>
            <div className="flex items-center gap-3">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 px-4 py-3 rounded-xl font-medium transition-all shadow-sm"
                title="Download CSV Template"
              >
                <FileWarning className="w-5 h-5 text-muted-foreground" />
                <span className="hidden sm:inline">Template</span>
              </button>
              
              <label className="flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600 px-4 py-3 rounded-xl font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50" title="Mass Upload CSV">
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">{uploadingCSV ? "Uploading..." : "Mass Upload"}</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={uploadingCSV} />
              </label>

              <button
                onClick={() => setShowCreateUser(true)}
                className="flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm"
              >
                <UserPlus className="w-5 h-5" />
                Add User
              </button>
            </div>
          </div>

          {/* Create User Modal */}
          {showCreateUser && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-lg">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-amber-500" />
                    Add Teacher / Student
                  </h3>
                  <button onClick={() => setShowCreateUser(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {userError && (
                  <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {userError}</span>
                    <button onClick={() => setUserError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}

                <div className="space-y-4 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="e.g. John Doe" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                    <input type="email" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="user@example.com" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value.trim() })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Role</label>
                    <select
                      className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      value={newUser.role}
                      onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                    </select>
                  </div>
                  {newUser.role === 'teacher' && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Teacher ID <span className="text-muted-foreground font-normal">(Optional)</span></label>
                      <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase" placeholder="e.g. FAC001" value={newUser.teacher_id} onChange={e => setNewUser({ ...newUser, teacher_id: e.target.value })} />
                    </div>
                  )}
                  {newUser.role === 'student' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Semester</label>
                        <select className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={newUser.semester_id} onChange={e => setNewUser({ ...newUser, semester_id: e.target.value })}>
                          <option value="">Select Semester</option>
                          {semestersList.map(sem => (
                            <option key={sem.id} value={sem.id}>{sem.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Section</label>
                        <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase" placeholder="e.g. A, B, CSE-A" value={newUser.section} onChange={e => setNewUser({ ...newUser, section: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Roll Number</label>
                        <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase" placeholder="e.g. 21CS001" value={newUser.roll_number} onChange={e => setNewUser({ ...newUser, roll_number: e.target.value })} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                    <input type="password" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="Min 6 characters" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 italic">User will be assigned to <strong>{deptName}</strong> department.</p>
                </div>

                <div className="flex gap-3 mt-8">
                  <button onClick={() => setShowCreateUser(false)} className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all">Cancel</button>
                  <button onClick={handleCreateUser} disabled={userCreating} className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">
                    {userCreating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit User Modal */}
          {editingUser && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-lg">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Settings className="w-5 h-5 text-amber-500" />
                    Edit {editingUser.role === 'student' ? 'Student' : 'Teacher'}
                  </h3>
                  <button onClick={() => setEditingUser(null)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {userError && (
                  <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {userError}</span>
                    <button onClick={() => setUserError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}

                <div className="space-y-4 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={editingUser.full_name} onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email (Login ID)</label>
                    <input type="email" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="user@example.com" value={editingUser.email || ''} onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} />
                  </div>
                  {editingUser.role === 'student' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Semester</label>
                        <select className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={editingUser.semester_id || ''} onChange={e => setEditingUser({ ...editingUser, semester_id: e.target.value })}>
                          <option value="">Select Semester</option>
                          {semestersList.map(sem => (
                            <option key={sem.id} value={sem.id}>{sem.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Section</label>
                        <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase" placeholder="e.g. A, B, CSE-A" value={editingUser.section || ''} onChange={e => setEditingUser({ ...editingUser, section: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">Roll Number</label>
                        <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase" placeholder="e.g. 21CS001" value={editingUser.roll_number || ''} onChange={e => setEditingUser({ ...editingUser, roll_number: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-3 mt-8">
                  <button onClick={() => setEditingUser(null)} className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all">Cancel</button>
                  <button onClick={handleUpdateUser} disabled={userCreating} className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">
                    {userCreating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Users Table */}
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingUsers ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No teachers or students found in your department.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">ID / Roll No</th>
                      <th className="p-4 font-semibold">Role</th>
                      <th className="p-4 font-semibold">Semester</th>
                      <th className="p-4 font-semibold">Section</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-medium text-foreground">{u.full_name}</td>
                        <td className="p-4 text-muted-foreground font-mono text-sm">{u.roll_number || '—'}</td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleColors[u.role] || 'bg-secondary text-foreground'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-4 text-muted-foreground text-sm">{u.semester_id ? (semestersList.find(s => s.id === u.semester_id)?.name || '—') : '—'}</td>
                        <td className="p-4 text-muted-foreground">{u.section || '—'}</td>
                        <td className="p-4 text-right">
                          <button onClick={() => setEditingUser(u)} className="p-2 mr-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors" title="Edit user">
                            <Settings className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteUser(u.id, u.full_name)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors" title="Delete user">
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
        </div>
      )}

      {/* ========= SEMESTERS TAB ========= */}
      {activeTab === 'semesters' && (
        <div className="space-y-6">
          {semesterSuccess && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center">
              <span>✓ {semesterSuccess}</span>
              <button onClick={() => setSemesterSuccess(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="relative flex-1 w-full md:max-w-xs">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search semesters..."
                className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
                value={searchSemesters}
                onChange={e => setSearchSemesters(e.target.value)}
              />
            </div>
            <button onClick={() => setShowCreateSemester(true)} className="flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm">
              <Plus className="w-5 h-5" />
              Add Semester
            </button>
          </div>

          {/* Create Semester Modal */}
          {showCreateSemester && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    New Semester
                  </h3>
                  <button onClick={() => setShowCreateSemester(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                {semesterError && (
                  <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {semesterError}</span>
                    <button onClick={() => setSemesterError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Semester Name/Number</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="e.g. Semester 1" value={newSemesterName} onChange={e => setNewSemesterName(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={() => setShowCreateSemester(false)} className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all">Cancel</button>
                  <button onClick={handleCreateSemester} disabled={semesterCreating} className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">
                    {semesterCreating ? 'Creating...' : 'Create Semester'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Semesters Table */}
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingSemesters ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading semesters...</div>
            ) : (() => {
              const filtered = semestersList.filter(sem =>
                sem.name.toLowerCase().includes(searchSemesters.toLowerCase())
              );
              return filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No semesters found. Create one to get started!</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                        <th className="p-4 font-semibold">Semester Name</th>
                        <th className="p-4 font-semibold">Students</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(sem => {
                        const studentCount = departmentUsers.filter(u => u.role === 'student' && u.semester_id === sem.id).length;
                        return (
                          <tr key={sem.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="p-4 font-bold text-foreground">{sem.name}</td>
                            <td className="p-4">
                              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                {studentCount} {studentCount === 1 ? 'student' : 'students'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========= SUBJECTS TAB ========= */}
      {activeTab === 'subjects' && (
        <div className="space-y-6">
          {subjectSuccess && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center">
              <span>✓ {subjectSuccess}</span>
              <button onClick={() => setSubjectSuccess(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="relative flex-1 w-full md:max-w-xs">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search subjects..."
                className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
                value={searchSubjects}
                onChange={e => setSearchSubjects(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={downloadSubjectTemplate}
                className="flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 px-4 py-3 rounded-xl font-medium transition-all shadow-sm"
                title="Download CSV Template"
              >
                <FileWarning className="w-5 h-5 text-muted-foreground" />
                <span className="hidden sm:inline">Template</span>
              </button>
              
              <label className="flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600 px-4 py-3 rounded-xl font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50" title="Mass Upload CSV">
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">{uploadingSubjectCSV ? "Uploading..." : "Mass Upload"}</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleSubjectFileUpload} disabled={uploadingSubjectCSV} />
              </label>

              <button onClick={() => { fetchSemesters(); setShowCreateSubject(true); }} className="flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm">
                <Plus className="w-5 h-5" />
                Add Subject
              </button>
            </div>
          </div>

          {/* Create Subject Modal */}
          {showCreateSubject && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    Add Subject to {deptName}
                  </h3>
                  <button onClick={() => setShowCreateSubject(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                {subjectError && (
                  <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {subjectError}</span>
                    <button onClick={() => setSubjectError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Semester</label>
                    <select className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={newSubject.semester_id} onChange={e => setNewSubject({ ...newSubject, semester_id: e.target.value })}>
                      <option value="">Select Semester</option>
                      {semestersList.map(sem => (
                        <option key={sem.id} value={sem.id}>{sem.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Subject Code</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase" placeholder="e.g. CS101" value={newSubject.subject_code} onChange={e => setNewSubject({ ...newSubject, subject_code: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Subject Name</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="e.g. Data Structures" value={newSubject.subject_name} onChange={e => setNewSubject({ ...newSubject, subject_name: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={() => setShowCreateSubject(false)} className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all">Cancel</button>
                  <button onClick={handleCreateSubject} disabled={subjectCreating} className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">
                    {subjectCreating ? 'Saving...' : 'Save Subject'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Subject Modal */}
          {editingSubject && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    Edit Subject
                  </h3>
                  <button onClick={() => setEditingSubject(null)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                {subjectError && (
                  <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {subjectError}</span>
                    <button onClick={() => setSubjectError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Subject Code</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase" value={editingSubject.subject_code} onChange={e => setEditingSubject({ ...editingSubject, subject_code: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Subject Name</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={editingSubject.subject_name} onChange={e => setEditingSubject({ ...editingSubject, subject_name: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={() => setEditingSubject(null)} className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all">Cancel</button>
                  <button onClick={handleUpdateSubject} disabled={subjectCreating} className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">
                    {subjectCreating ? 'Saving...' : 'Update Subject'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Subjects grouped by Semester */}
          <div className="space-y-4">
            {loadingSubjects ? (
              <div className="bg-card rounded-3xl shadow-sm border border-border p-8 text-center text-muted-foreground animate-pulse">Loading subjects...</div>
            ) : (() => {
              const filtered = subjects.filter(sub =>
                sub.subject_name.toLowerCase().includes(searchSubjects.toLowerCase()) ||
                sub.subject_code.toLowerCase().includes(searchSubjects.toLowerCase()) ||
                (sub.semesters?.name || '').toLowerCase().includes(searchSubjects.toLowerCase())
              );
              // Group by semester
              const bySemester = filtered.reduce((acc, sub) => {
                const semName = sub.semesters?.name || 'Unassigned Semester';
                if (!acc[semName]) acc[semName] = [];
                acc[semName].push(sub);
                return acc;
              }, {} as Record<string, Subject[]>);
              const semKeys = Object.keys(bySemester).sort();

              return semKeys.length === 0 ? (
                <div className="bg-card rounded-3xl shadow-sm border border-border p-8 text-center text-muted-foreground">No subjects found. Add one!</div>
              ) : (
                semKeys.map(semName => (
                  <div key={semName} className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
                    <div className="bg-secondary/50 px-5 py-3 border-b border-border flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-amber-500" />
                      <h3 className="font-bold text-foreground text-sm">{semName}</h3>
                      <span className="ml-auto text-xs text-muted-foreground">{bySemester[semName].length} subjects</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-background text-foreground text-sm border-b border-border">
                            <th className="p-4 font-semibold">Code</th>
                            <th className="p-4 font-semibold">Name</th>
                            <th className="p-4 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bySemester[semName].map(sub => (
                            <tr key={sub.id} className="hover:bg-secondary/20 transition-colors">
                              <td className="p-4 font-bold text-foreground">{sub.subject_code}</td>
                              <td className="p-4 font-medium text-muted-foreground">{sub.subject_name}</td>
                              <td className="p-4 text-right">
                                <button onClick={() => setEditingSubject(sub)} className="p-2 mr-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors" title="Edit subject">
                                  <Settings className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteSubject(sub.id, sub.subject_name)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors" title="Delete subject">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              );
            })()}
          </div>
        </div>
      )}

      {/* ========= SECTION ASSIGNMENT TAB ========= */}
      {activeTab === 'sections' && (
        <div className="space-y-6">
          {sectionError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
              <span><strong>Error:</strong> {sectionError}</span>
              <button onClick={() => setSectionError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}
          {sectionSuccess && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center">
              <span>✓ {sectionSuccess}</span>
              <button onClick={() => setSectionSuccess(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
            <h2 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-amber-500" />
              Bulk Section ↔ Teacher Assignment
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Select a subject, section, and teacher. All students in the section will be enrolled and assigned to the teacher for that subject.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Semester</label>
                <select
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={selectedSemesterForAssign}
                  onChange={e => setSelectedSemesterForAssign(e.target.value)}
                >
                  <option value="">Select...</option>
                  {semestersList.map(sem => (
                    <option key={sem.id} value={sem.id}>{sem.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Subject</label>
                <select
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  disabled={!selectedSemesterForAssign}
                >
                  <option value="">Select...</option>
                  {deptSubjects.filter((s: any) => s.semester_id === selectedSemesterForAssign).map(s => (
                    <option key={s.id} value={s.id}>{s.subject_code} — {s.subject_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Section</label>
                <select
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={selectedSection}
                  onChange={e => setSelectedSection(e.target.value)}
                >
                  <option value="">Select Section...</option>
                  {sections.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {sections.length === 0 && <p className="text-xs text-amber-500 mt-1">No sections found. Create students with sections first.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Teacher</label>
                <select
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={selectedTeacher}
                  onChange={e => setSelectedTeacher(e.target.value)}
                >
                  <option value="">Select Teacher...</option>
                  {deptTeachers.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
                {deptTeachers.length === 0 && <p className="text-xs text-amber-500 mt-1">No teachers found in department.</p>}
              </div>
            </div>

            <button
              onClick={handleSectionAssign}
              disabled={assigning || !selectedSemesterForAssign || !selectedSection || !selectedSubject || !selectedTeacher}
              className="mt-6 bg-amber-500 text-white hover:bg-amber-600 px-8 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
            >
              {assigning ? 'Assigning...' : 'Assign Section to Teacher'}
            </button>
          </div>
        </div>
      )}

      {/* ========= DUES TAB ========= */}
      {activeTab === 'dues' && (
        <div className="space-y-6">
          <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <FileWarning className="w-5 h-5 text-amber-500" />
                  Department College Dues Status
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  View students pending college fee dues in your department and approve payment clearance.
                </p>
              </div>
              <div className="relative w-full md:max-w-xs">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name or roll no..."
                  className="pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
                  value={searchDues}
                  onChange={e => setSearchDues(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
              {loadingDues ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse">Loading college dues...</div>
              ) : (() => {
                const filtered = departmentDues.filter(d => d.status !== 'completed').filter(d =>
                  d.profiles?.full_name?.toLowerCase().includes(searchDues.toLowerCase()) ||
                  d.profiles?.roll_number?.toLowerCase().includes(searchDues.toLowerCase())
                );
                return filtered.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No pending college dues found for students in this department.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                          <th className="p-4 font-semibold">Student Name</th>
                          <th className="p-4 font-semibold">Roll Number</th>
                          <th className="p-4 font-semibold">Section & Sem</th>
                          <th className="p-4 font-semibold">Fine (₹)</th>
                          <th className="p-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filtered.map(d => (
                          <tr key={d.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="p-4 font-medium text-foreground">{d.profiles?.full_name}</td>
                            <td className="p-4 text-muted-foreground font-mono">{d.profiles?.roll_number || '—'}</td>
                            <td className="p-4 text-muted-foreground">
                              {d.profiles?.section ? `Sec ${d.profiles.section}` : '—'}
                              {d.profiles?.semesters?.name ? ` · ${d.profiles.semesters.name}` : ''}
                            </td>
                            <td className="p-4 font-bold text-destructive">₹{d.fine_amount || 0}</td>
                            <td className="p-4 text-right">
                               <button
                                 onClick={() => handleApproveDue(d.id)}
                                 className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
                               >
                                 Approve
                               </button>
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
        </div>
      )}

    </div>
  );
}
