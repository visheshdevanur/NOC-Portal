import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import { approveHodRequest, getAllDepartments, getFycStaffActivityLogs } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import {
  CheckCircle2, UserCog, Search, Users, Activity, X,
  Trash2, UserPlus, Download, User, ChevronDown, ChevronRight, FileCheck,
  GraduationCap, BookOpen, Eye, Clock, Import, Check
} from 'lucide-react';
import { getFriendlyErrorMessage } from '../../lib/errorHandler';

type ClearanceRequest = {
  id: string;
  student_id: string;
  current_stage: string;
  status: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string; department_id: string; semesters?: { name: string }; departments?: { name: string } } | null;
};

type ClearanceInfo = { status: string, current_stage: string, created_at: string, updated_at: string };

type UserProfile = {
  id: string;
  full_name: string;
  role: string;
  department_id: string | null;
  section: string | null;
  created_at: string;
  semesters?: { name: string } | null;
  departments?: { name: string } | null;
  clearance_requests?: ClearanceInfo[] | ClearanceInfo | null;
};

const getClearanceReq = (student: UserProfile): ClearanceInfo | null => {
  if (!student.clearance_requests) return null;
  if (Array.isArray(student.clearance_requests)) {
    return student.clearance_requests.length > 0 ? student.clearance_requests[0] : null;
  }
  return student.clearance_requests;
};

type TeacherWithAssignments = {
  id: string;
  full_name: string;
  role: string;
  email?: string;
  created_at: string;
  assignments: {
    subject_name: string;
    subject_code: string;
    semester: string;
    sections: string[];
  }[];
};

type TabType = 'approvals' | 'users' | 'students' | 'fineApprovals' | 'teacherDetails' | 'activityLogs';

const isFirstYearSem = (name: string) => {
  if (!name) return false;
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return n.includes('sem1') || n.includes('sem2') || 
         n.includes('1stsem') || n.includes('2ndsem') ||
         n.includes('semester1') || n.includes('semester2') ||
         n === '1' || n === '2' || 
         n.endsWith('1stsemester') || n.endsWith('2ndsemester') ||
         /\b1\b/.test(name) || /\b2\b/.test(name);
};

export default function FycDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('approvals');
  const [departments, setDepartments] = useState<any[]>([]);

  // Approvals state
  const [requests, setRequests] = useState<ClearanceRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [searchReqs, setSearchReqs] = useState('');

  // Users state
  const [departmentUsers, setDepartmentUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'clerk', department_id: '' });
  const [userCreating, setUserCreating] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Import Teachers state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importDeptId, setImportDeptId] = useState('');
  const [importTeachersList, setImportTeachersList] = useState<any[]>([]);
  const [loadingImportTeachers, setLoadingImportTeachers] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importingTeachers, setImportingTeachers] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Students state
  const [departmentStudents, setDepartmentStudents] = useState<UserProfile[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());
  const [searchStudents, setSearchStudents] = useState('');

  // Fine Approvals state
  const [approvedFines, setApprovedFines] = useState<any[]>([]);
  const [loadingFines, setLoadingFines] = useState(false);
  const [searchFines, setSearchFines] = useState('');

  // Teacher Details state
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherWithAssignments[]>([]);
  const [loadingTeacherDetails, setLoadingTeacherDetails] = useState(false);
  const [searchTeachers, setSearchTeachers] = useState('');
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());

  // Activity Logs state
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchLogs, setSearchLogs] = useState('');
  const [logRoleFilter, setLogRoleFilter] = useState('all');

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (user) {
      if (activeTab === 'approvals') fetchRequests();
      if (activeTab === 'users') fetchUsers();
      if (activeTab === 'students') fetchStudents();
      if (activeTab === 'fineApprovals') fetchApprovedFines();
      if (activeTab === 'teacherDetails') fetchTeacherDetails();
      if (activeTab === 'activityLogs') fetchActivityLogs();
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (user) {
      const channel = supabase.channel('fyc-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clearance_requests', filter: `current_stage=eq.hod_review` }, () => {
          if (activeTab === 'approvals') fetchRequests();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); }
    }
  }, [user, activeTab]);

  const fetchDepartments = async () => {
    try {
      const data = await getAllDepartments();
      setDepartments(data || []);
    } catch (err) { console.error(err); }
  };

  const fetchRequests = async () => {
    setLoadingReqs(true);
    try {
      const { data, error } = await supabase
        .from('clearance_requests')
        .select('*, profiles!inner(full_name, department_id, semesters(name), departments!profiles_department_id_fkey(name))')
        .eq('current_stage', 'hod_review');
      if (error) throw error;
      const filtered = (data || []).filter((r: any) => isFirstYearSem(r.profiles?.semesters?.name || ''));
      setRequests(filtered as unknown as ClearanceRequest[]);
    } catch (err) { console.error(err); }
    finally { setLoadingReqs(false); }
  };

  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, semesters(name), clearance_requests(status, current_stage, created_at, updated_at), departments!profiles_department_id_fkey(name)')
        .eq('role', 'student')
        .order('full_name');
      if (error) throw error;
      const filtered = (data || []).filter((s: any) => isFirstYearSem(s.semesters?.name || ''));
      setDepartmentStudents(filtered as unknown as UserProfile[]);
    } catch (err) { console.error(err); }
    finally { setLoadingStudents(false); }
  };

  const fetchUsers = async () => {
    if (!user?.id) return;
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, departments!profiles_department_id_fkey(name)')
        .in('role', ['clerk', 'teacher', 'faculty'])
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDepartmentUsers(data as UserProfile[]);
    } catch (err) { console.error(err); }
    finally { setLoadingUsers(false); }
  };

  const fetchApprovedFines = async () => {
    setLoadingFines(true);
    try {
        const { data, error } = await supabase
          .from('subject_enrollment')
          .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, section, department_id, roll_number, semesters(name), departments!profiles_department_id_fkey(name)), subjects(subject_name, subject_code)')
          .eq('remarks', 'Approved by Staff after Fine');
      if (error) throw error;
      const filtered = (data || []).filter((s: any) => isFirstYearSem(s.profiles?.semesters?.name || ''));
      setApprovedFines(filtered || []);
    } catch (err) { console.error(err); }
    finally { setLoadingFines(false); }
  };

  const fetchTeacherDetails = async () => {
    if (!user?.id) return;
    setLoadingTeacherDetails(true);
    try {
      const { data: teachers, error: tErr } = await supabase
        .from('profiles')
        .select('id, full_name, role, section, email, created_at')
        .in('role', ['teacher', 'faculty'])
        .eq('created_by', user.id)
        .order('full_name');
      if (tErr) throw tErr;

      const teacherIds = (teachers || []).map(t => t.id);
      if (teacherIds.length === 0) {
        setTeacherAssignments([]);
        setLoadingTeacherDetails(false);
        return;
      }

      const { data: enrollments, error: eErr } = await supabase
        .from('subject_enrollment')
        .select('teacher_id, subject_id, subjects!inner(subject_name, subject_code, semester_id, semesters(name)), profiles!subject_enrollment_student_id_fkey!inner(section, semester_id)')
        .in('teacher_id', teacherIds);
      if (eErr) throw eErr;

      const filteredEnrollments = (enrollments || []).filter((e: any) => isFirstYearSem(e.subjects?.semesters?.name || ''));

      const assignmentMap: Record<string, { subjects: Record<string, { subject_name: string; subject_code: string; semester: string; sections: Set<string> }> }> = {};

      for (const enrollment of filteredEnrollments) {
        const tid = enrollment.teacher_id;
        if (!tid) continue;
        if (!assignmentMap[tid]) assignmentMap[tid] = { subjects: {} };

        const subj = (enrollment as any).subjects;
        const studentProfile = (enrollment as any).profiles;
        const subjectKey = enrollment.subject_id;
        const section = studentProfile?.section || 'Unassigned';
        const semesterName = subj?.semesters?.name || 'N/A';

        if (!assignmentMap[tid].subjects[subjectKey]) {
          assignmentMap[tid].subjects[subjectKey] = {
            subject_name: subj?.subject_name || 'Unknown',
            subject_code: subj?.subject_code || '',
            semester: semesterName,
            sections: new Set()
          };
        }
        assignmentMap[tid].subjects[subjectKey].sections.add(section);
      }

      setTeacherAssignments((teachers || []).map(teacher => ({
        ...teacher,
        assignments: assignmentMap[teacher.id]
          ? Object.values(assignmentMap[teacher.id].subjects).map(s => ({
              subject_name: s.subject_name,
              subject_code: s.subject_code,
              semester: s.semester,
              sections: Array.from(s.sections)
            }))
          : []
      })));
    } catch (err) { console.error(err); }
    finally { setLoadingTeacherDetails(false); }
  };

  const fetchActivityLogs = async () => {
    if (!user?.id) return;
    setLoadingLogs(true);
    try {
      const data = await getFycStaffActivityLogs();
      setActivityLogs(data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingLogs(false); }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveHodRequest(id);
      const req = requests.find(r => r.id === id);
      if (req) {
        await supabase.from('notifications').insert([{
          user_id: req.student_id,
          title: 'Final Clearance Approved!',
          message: 'FYC has approved your final clearance. You can now view your No Due Clearance Report.',
          type: 'success'
        }]);
        await supabase.from('activity_logs').insert([{
          user_id: user?.id,
          user_role: 'fyc',
          user_name: user?.email,
          action: 'Clearance Approved',
          details: `Approved clearance for student ${req.profiles?.full_name}`
        }]);
      }
      fetchRequests();
    } catch (err: any) {
      alert("Failed to approve request: " + getFriendlyErrorMessage(err));
    }
  };

  const handleBulkApprove = async () => {
    const filtered = requests.filter(r => r.profiles?.full_name?.toLowerCase().includes(searchReqs.toLowerCase()));
    if (!window.confirm(`Are you sure you want to approve all ${filtered.length} pending requests?`)) return;
    try {
      for (const req of filtered) {
        await approveHodRequest(req.id);
        await supabase.from('notifications').insert([{
          user_id: req.student_id,
          title: 'Final Clearance Approved!',
          message: 'FYC has approved your final clearance. You can now view your No Due Clearance Report.',
          type: 'success'
        }]);
        await supabase.from('activity_logs').insert([{
          user_id: user?.id,
          user_role: 'fyc',
          user_name: user?.email,
          action: 'Clearance Approved',
          details: `Approved clearance for student ${req.profiles?.full_name} (Bulk)`
        }]);
      }
      fetchRequests();
    } catch (err: any) {
      alert("Error during bulk approval: " + getFriendlyErrorMessage(err));
    }
  };

  const handleCreateUser = async () => {
    setUserCreating(true);
    setUserError(null);
    setUserSuccess(null);

    if (!newUser.email || !newUser.password || !newUser.full_name || !newUser.department_id) {
      setUserError('All fields including Department are required.');
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

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        full_name: newUser.full_name,
        role: newUser.role as any,
        department_id: newUser.department_id,
        created_by: user.id
      });
      if (profileError) throw profileError;

      await supabase.from('activity_logs').insert([{
        user_id: user?.id,
        user_role: 'fyc',
        user_name: user?.email,
        department_id: newUser.department_id,
        action: 'User Created',
        details: `Created ${newUser.role} profile for ${newUser.full_name}`
      }]);

      setUserSuccess(`${newUser.role === 'clerk' ? 'Clerk' : 'Teacher'} "${newUser.full_name}" created!`);
      setNewUser({ email: '', password: '', full_name: '', role: 'clerk', department_id: '' });
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
      const { error } = await supabase.from('profiles').delete().eq('id', userId).eq('created_by', user.id);
      if (error) throw error;
      
      await supabase.from('activity_logs').insert([{
        user_id: user?.id,
        user_role: 'fyc',
        user_name: user?.email,
        action: 'User Deleted',
        details: `Deleted user ${userName}`
      }]);

      setUserSuccess(`"${userName}" deleted.`);
      fetchUsers();
    } catch (err: any) {
      setUserError(getFriendlyErrorMessage(err));
    }
  };

  // ==================== IMPORT TEACHERS ======================
  const fetchDeptTeachersForImport = async (deptId: string) => {
    if (!deptId) { setImportTeachersList([]); return; }
    setLoadingImportTeachers(true);
    setImportError(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, created_by, departments!profiles_department_id_fkey(name)')
        .eq('department_id', deptId)
        .in('role', ['teacher', 'faculty'])
        .order('full_name');
      if (error) throw error;
      setImportTeachersList(data || []);
      setSelectedImportIds(new Set());
    } catch (err: any) {
      setImportError(getFriendlyErrorMessage(err));
      setImportTeachersList([]);
    } finally {
      setLoadingImportTeachers(false);
    }
  };

  const handleImportTeachers = async () => {
    if (selectedImportIds.size === 0) { setImportError('Select at least one teacher to import.'); return; }
    setImportingTeachers(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      let count = 0;
      for (const teacherId of selectedImportIds) {
        const { error } = await supabase
          .from('profiles')
          .update({ created_by: user.id } as any)
          .eq('id', teacherId);
        if (error) throw error;
        count++;
      }

      // Log the import
      const teacherNames = importTeachersList
        .filter(t => selectedImportIds.has(t.id))
        .map(t => t.full_name)
        .join(', ');
      await supabase.from('activity_logs').insert([{
        user_id: user?.id,
        user_role: 'fyc',
        user_name: user?.email,
        action: 'Imported Teachers',
        details: `Imported ${count} teacher(s) from department: ${teacherNames}`
      }]);

      setImportSuccess(`Successfully imported ${count} teacher(s)!`);
      setSelectedImportIds(new Set());
      setShowImportModal(false);
      setImportDeptId('');
      setImportTeachersList([]);
      fetchUsers();
    } catch (err: any) {
      setImportError(getFriendlyErrorMessage(err));
    } finally {
      setImportingTeachers(false);
    }
  };

  const toggleImportSelection = (teacherId: string) => {
    const next = new Set(selectedImportIds);
    if (next.has(teacherId)) next.delete(teacherId);
    else next.add(teacherId);
    setSelectedImportIds(next);
  };

  const toggleAllImport = () => {
    if (selectedImportIds.size === importTeachersList.length) {
      setSelectedImportIds(new Set());
    } else {
      setSelectedImportIds(new Set(importTeachersList.map(t => t.id)));
    }
  };

  const handleExportStudentsCSV = () => {
    if (departmentStudents.length === 0) {
      alert("No students to export.");
      return;
    }
    const header = "Name,Roll Number,Department,Semester,Section,Clearance Status,Current Stage\n";
    const rows = departmentStudents.map(student => {
      const req = getClearanceReq(student);
      const status = req ? req.status : 'Not Applied';
      const stage = req ? req.current_stage : 'N/A';
      const sem = student.semesters?.name || 'N/A';
      const dept = student.departments?.name || 'N/A';
      return `"${student.full_name}","${(student as any).roll_number || 'N/A'}","${dept}","${sem}","${student.section || 'N/A'}","${status}","${stage}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fyc_students_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportClearanceCSV = () => {
    const studentsWithClearance = departmentStudents.filter(s => getClearanceReq(s) !== null);
    if (studentsWithClearance.length === 0) {
      alert("No clearance data to export.");
      return;
    }
    const header = "Name,Roll Number,Department,Semester,Section,Clearance Status,Current Stage,Applied Date,Last Updated\n";
    const rows = studentsWithClearance.map(student => {
      const req = getClearanceReq(student)!;
      const sem = student.semesters?.name || 'N/A';
      const dept = student.departments?.name || 'N/A';
      const appliedDate = req.created_at ? new Date(req.created_at).toLocaleDateString() : 'N/A';
      const updatedDate = req.updated_at ? new Date(req.updated_at).toLocaleDateString() : 'N/A';
      return `"${student.full_name}","${(student as any).roll_number || 'N/A'}","${dept}","${sem}","${student.section || 'N/A'}","${req.status}","${req.current_stage}","${appliedDate}","${updatedDate}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fyc_clearance_details.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'approvals', label: 'Clearances', icon: <Activity className="w-4 h-4" /> },
    { id: 'fineApprovals', label: 'Fine Approvals', icon: <FileCheck className="w-4 h-4" /> },
    { id: 'users', label: 'Clerks & Teachers', icon: <Users className="w-4 h-4" /> },
    { id: 'teacherDetails', label: 'Teacher Details', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'students', label: 'Students', icon: <User className="w-4 h-4" /> },
    { id: 'activityLogs', label: 'Activity Logs', icon: <Clock className="w-4 h-4" /> }
  ];

  const toggleSem = (semKey: string) => {
    const next = new Set(expandedSems);
    if (next.has(semKey)) next.delete(semKey);
    else next.add(semKey);
    setExpandedSems(next);
  };

  const toggleTeacher = (teacherId: string) => {
    const next = new Set(expandedTeachers);
    if (next.has(teacherId)) next.delete(teacherId);
    else next.add(teacherId);
    setExpandedTeachers(next);
  };

  const filteredTeacherDetails = teacherAssignments.filter(t =>
    t.full_name?.toLowerCase().includes(searchTeachers.toLowerCase()) ||
    t.assignments.some(a =>
      a.subject_name?.toLowerCase().includes(searchTeachers.toLowerCase()) ||
      a.subject_code?.toLowerCase().includes(searchTeachers.toLowerCase()) ||
      a.sections.some(s => s.toLowerCase().includes(searchTeachers.toLowerCase()))
    )
  );

  const handleExportTeacherCSV = () => {
    if (teacherAssignments.length === 0) { alert('No data to export.'); return; }
    const header = 'Teacher Name,Role,Subject Name,Subject Code,Semester,Sections\n';
    const rows: string[] = [];
    for (const t of teacherAssignments) {
      if (t.assignments.length === 0) {
        rows.push(`"${t.full_name}","${t.role}","No assignments","","",""`);
      } else {
        for (const a of t.assignments) {
          rows.push(`"${t.full_name}","${t.role}","${a.subject_name}","${a.subject_code}","${a.semester}","${a.sections.join(', ')}"`);
        }
      }
    }
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fyc_teacher_details_export.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredStudents = departmentStudents.filter(s =>
    s.full_name?.toLowerCase().includes(searchStudents.toLowerCase()) ||
    (s as any).roll_number?.toLowerCase().includes(searchStudents.toLowerCase()) ||
    s.section?.toLowerCase().includes(searchStudents.toLowerCase())
  );

  const studentsByDeptSem = filteredStudents.reduce((acc, student) => {
    const dept = student.departments?.name || 'Unassigned Department';
    const sem = student.semesters?.name || 'Unassigned Semester';
    const key = `${dept} - ${sem}`;
    if (!acc[key]) acc[key] = {};
    const sec = student.section || 'Unassigned Section';
    if (!acc[key][sec]) acc[key][sec] = [];
    acc[key][sec].push(student);
    return acc;
  }, {} as Record<string, Record<string, UserProfile[]>>);

  const filteredReqs = requests.filter(r => r.profiles?.full_name?.toLowerCase().includes(searchReqs.toLowerCase()));
  const filteredUsers = departmentUsers.filter(u => u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) || u.role?.toLowerCase().includes(searchUsers.toLowerCase()));

  const roleColors: Record<string, string> = {
    clerk: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    teacher: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    faculty: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  };

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-violet-500"></div>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
            <UserCog className="w-8 h-8 mr-3 text-violet-500" />
            First Year Coordinator (FYC)
          </h1>
          <p className="text-muted-foreground">Manage clearances, clerks, teachers, and students across all departments (1st Year Only).</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border flex flex-wrap gap-1 w-full xl:w-max">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-violet-500 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========= APPROVALS TAB ========= */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex gap-4 w-full md:w-auto mt-2">
            <div className="relative flex-1 md:w-64">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search students..."
                className="pl-10 pr-4 py-3 bg-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-full md:w-80"
                value={searchReqs}
                onChange={e => setSearchReqs(e.target.value)}
              />
            </div>
            <button
              onClick={handleBulkApprove}
              disabled={filteredReqs.length === 0}
              className="flex items-center gap-2 bg-violet-500 text-white hover:bg-violet-600 px-6 py-3 rounded-xl font-bold disabled:opacity-50 transition-all shadow-sm"
            >
              <CheckCircle2 className="w-5 h-5" />
              Bulk Approve
            </button>
          </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingReqs ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading ready requests...</div>
            ) : filteredReqs.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-10 h-10 text-violet-500/50" />
                </div>
                <h3 className="text-xl font-bold text-foreground">All Clear!</h3>
                <p className="text-muted-foreground mt-2">No pending requests awaiting your final approval.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-4 font-semibold">Student Name</th>
                      <th className="p-4 font-semibold">Department</th>
                      <th className="p-4 font-semibold">Arrival Date</th>
                      <th className="p-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredReqs.map(req => (
                      <tr key={req.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-bold text-foreground">{req.profiles?.full_name || 'Unknown'}</td>
                        <td className="p-4 text-foreground">{req.profiles?.departments?.name || 'Unknown'}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {new Date(req.updated_at).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleApprove(req.id)}
                            className="px-4 py-2 rounded-xl bg-violet-500/10 text-violet-600 hover:bg-violet-500 hover:text-white transition-colors font-medium border border-violet-500/20 hover:border-violet-500"
                          >
                            Approve
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
                placeholder="Search clerks/teachers..."
                className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-full"
                value={searchUsers}
                onChange={e => setSearchUsers(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowImportModal(true); setImportError(null); setImportSuccess(null); }}
                className="flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm"
              >
                <Import className="w-5 h-5" />
                Import from Department
              </button>
              <button
                onClick={() => setShowCreateUser(true)}
                className="flex items-center gap-2 bg-violet-500 text-white hover:bg-violet-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm"
              >
                <UserPlus className="w-5 h-5" />
                Add Clerk / Teacher
              </button>
            </div>
          </div>

          {/* Import Teachers Modal */}
          {showImportModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto p-4 flex items-start justify-center">
              <div className="bg-card rounded-3xl p-6 shadow-2xl border border-border w-full max-w-2xl mt-10 mb-10 relative">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Import className="w-5 h-5 text-blue-500" />
                    Import Teachers from Department
                  </h3>
                  <button onClick={() => { setShowImportModal(false); setImportDeptId(''); setImportTeachersList([]); setSelectedImportIds(new Set()); }} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {importError && (
                  <div className="p-3 mb-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {importError}</span>
                    <button onClick={() => setImportError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}
                {importSuccess && (
                  <div className="p-3 mb-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center">
                    <span>✓ {importSuccess}</span>
                    <button onClick={() => setImportSuccess(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Select Department</label>
                    <select
                      className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={importDeptId}
                      onChange={e => { setImportDeptId(e.target.value); fetchDeptTeachersForImport(e.target.value); }}
                    >
                      <option value="">Choose a department...</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  {importDeptId && (
                    <div className="border border-border rounded-2xl overflow-hidden">
                      {loadingImportTeachers ? (
                        <div className="p-8 text-center text-muted-foreground animate-pulse">Loading teachers...</div>
                      ) : importTeachersList.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">No teachers found in this department.</div>
                      ) : (
                        <>
                          <div className="bg-secondary/50 px-4 py-3 border-b border-border flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500"
                                checked={selectedImportIds.size === importTeachersList.length && importTeachersList.length > 0}
                                onChange={toggleAllImport}
                              />
                              Select All ({importTeachersList.length} teachers)
                            </label>
                            <span className="text-xs text-muted-foreground">{selectedImportIds.size} selected</span>
                          </div>
                          <div className="max-h-[40vh] overflow-y-auto">
                            {importTeachersList.map(teacher => {
                              const isAlreadyManaged = teacher.created_by === user?.id;
                              return (
                                <label
                                  key={teacher.id}
                                  className={`flex items-center gap-4 p-4 border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                                    isAlreadyManaged ? 'bg-emerald-500/5 opacity-70' : 'hover:bg-secondary/30'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500"
                                    checked={selectedImportIds.has(teacher.id)}
                                    onChange={() => toggleImportSelection(teacher.id)}
                                    disabled={isAlreadyManaged}
                                  />
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                    {teacher.full_name?.charAt(0)?.toUpperCase() || 'T'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{teacher.full_name}</p>
                                    <p className="text-xs text-muted-foreground">{teacher.email || 'No email'}</p>
                                  </div>
                                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${roleColors[teacher.role] || 'bg-secondary text-foreground'}`}>
                                    {teacher.role}
                                  </span>
                                  {isAlreadyManaged && (
                                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                      <Check className="w-3.5 h-3.5" /> Already imported
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => { setShowImportModal(false); setImportDeptId(''); setImportTeachersList([]); setSelectedImportIds(new Set()); }} className="flex-1 py-2.5 px-4 rounded-xl border border-border font-medium hover:bg-secondary transition-all">Cancel</button>
                  <button
                    onClick={handleImportTeachers}
                    disabled={importingTeachers || selectedImportIds.size === 0}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Import className="w-4 h-4" />
                    {importingTeachers ? 'Importing...' : `Import ${selectedImportIds.size} Teacher${selectedImportIds.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create User Modal */}
          {showCreateUser && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto p-4 flex items-start justify-center">
              <div className="bg-card rounded-3xl p-6 shadow-2xl border border-border w-full max-w-lg mt-10 mb-10 relative">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-violet-500" />
                    Add Clerk / Teacher
                  </h3>
                  <button onClick={() => setShowCreateUser(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                {userError && (
                  <div className="p-3 mb-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {userError}</span>
                    <button onClick={() => setUserError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Department</label>
                    <select
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                      value={newUser.department_id}
                      onChange={e => setNewUser({ ...newUser, department_id: e.target.value })}
                    >
                      <option value="">Select Department...</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
                    <input type="text" className="w-full px-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Email</label>
                    <input type="email" className="w-full px-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value.trim() })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Role</label>
                    <select
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                      value={newUser.role}
                      onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="clerk">Clerk</option>
                      <option value="teacher">Teacher</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Password</label>
                    <input type="password" className="w-full px-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowCreateUser(false)} className="flex-1 py-2 px-4 rounded-xl border border-border font-medium hover:bg-secondary">Cancel</button>
                  <button onClick={handleCreateUser} disabled={userCreating} className="flex-1 py-2 px-4 rounded-xl bg-violet-500 text-white font-bold hover:bg-violet-600 disabled:opacity-50">
                    {userCreating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Users Table */}
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingUsers ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading your clerks & teachers...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No clerks or teachers created by you found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">Department</th>
                      <th className="p-4 font-semibold">Role</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-medium text-foreground">{u.full_name}</td>
                        <td className="p-4 text-muted-foreground">{u.departments?.name || '—'}</td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${roleColors[u.role] || 'bg-secondary text-foreground'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-4 text-right">
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

      {/* ========= STUDENTS TAB ========= */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
            <div>
              <h2 className="text-xl font-bold text-foreground">First Year Students Overview</h2>
              <p className="text-muted-foreground text-sm">View students by department, semester and section.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                 onClick={handleExportClearanceCSV}
                 disabled={departmentStudents.length === 0}
                 className="flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600 px-4 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
               >
                 <Download className="w-5 h-5" />
                 Clearance CSV
              </button>
              <button
                 onClick={handleExportStudentsCSV}
                 disabled={departmentStudents.length === 0}
                 className="flex items-center gap-2 bg-violet-500 text-white hover:bg-violet-600 px-4 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
               >
                 <Download className="w-5 h-5" />
                 Export to CSV
              </button>
            </div>
          </div>

          <div className="relative w-full md:max-w-sm">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, roll number, or section..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-full"
              value={searchStudents}
              onChange={e => setSearchStudents(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            {loadingStudents ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse bg-card rounded-3xl shadow-sm border border-border">Loading students...</div>
            ) : departmentStudents.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground bg-card rounded-3xl shadow-sm border border-border">No first year students found.</div>
            ) : (
              Object.entries(studentsByDeptSem).map(([deptSem, sections]) => {
                const totalInSem = Object.values(sections).reduce((acc, s) => acc + s.length, 0);
                const isExpanded = expandedSems.has(deptSem);
                return (
                  <div key={deptSem} className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                    <button
                      onClick={() => toggleSem(deptSem)}
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{deptSem}</h3>
                          <p className="text-sm text-muted-foreground">{totalInSem} students</p>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border overflow-x-auto p-4 space-y-4">
                        {Object.entries(sections).map(([sec, studentsList]) => (
                           <div key={sec}>
                              <h4 className="font-bold text-foreground bg-secondary/50 px-4 py-2 rounded-t-xl">Section: {sec}</h4>
                              <table className="w-full text-left border-collapse border border-border rounded-b-xl overflow-hidden">
                                <thead>
                                  <tr className="bg-background text-foreground text-sm border-b border-border">
                                    <th className="p-3 font-semibold w-1/3">Name</th>
                                    <th className="p-3 font-semibold w-1/4">Roll Number</th>
                                    <th className="p-3 font-semibold w-1/4">Clearance Status</th>
                                    <th className="p-3 font-semibold">Stage</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {studentsList.map(s => {
                                     const req = getClearanceReq(s);
                                     return (
                                       <tr key={s.id} className="hover:bg-secondary/10 transition-colors bg-background">
                                         <td className="p-3 font-medium text-foreground">{s.full_name}</td>
                                         <td className="p-3 text-muted-foreground text-sm font-mono">{(s as any).roll_number || '—'}</td>
                                         <td className="p-3">
                                           <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                              !req ? 'bg-secondary text-muted-foreground' : 
                                              req.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                                              req.status === 'rejected' ? 'bg-red-500/10 text-red-600' :
                                              'bg-amber-500/10 text-amber-600'
                                           }`}>
                                              {!req ? 'NOT APPLIED' : req.status.toUpperCase()}
                                           </span>
                                         </td>
                                         <td className="p-3 text-xs font-medium text-muted-foreground">{req ? req.current_stage : '—'}</td>
                                       </tr>
                                     )
                                  })}
                                </tbody>
                              </table>
                           </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ========= FINE APPROVALS TAB ========= */}
      {activeTab === 'fineApprovals' && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-1">
              <FileCheck className="w-5 h-5 text-violet-500" />
              Attendance Fine Approvals by Staff (1st Year)
            </h2>
            <p className="text-muted-foreground text-sm">
              First year students whose attendance fines were approved (overridden) by staff.
            </p>
          </div>

          <div className="relative w-full md:max-w-xs">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by student or subject..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-full"
              value={searchFines}
              onChange={e => setSearchFines(e.target.value)}
            />
          </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingFines ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading approved fines...</div>
            ) : (() => {
              const filtered = approvedFines.filter(item =>
                item.profiles?.full_name?.toLowerCase().includes(searchFines.toLowerCase()) ||
                item.subjects?.subject_name?.toLowerCase().includes(searchFines.toLowerCase()) ||
                item.subjects?.subject_code?.toLowerCase().includes(searchFines.toLowerCase()) ||
                item.profiles?.roll_number?.toLowerCase().includes(searchFines.toLowerCase())
              );
              return filtered.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                    <FileCheck className="w-10 h-10 text-violet-500/50" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">No Fine Approvals</h3>
                  <p className="text-muted-foreground mt-2">No attendance fines have been approved by staff yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                        <th className="p-4 font-semibold">Student Name</th>
                        <th className="p-4 font-semibold">Roll No</th>
                        <th className="p-4 font-semibold">Department</th>
                        <th className="p-4 font-semibold">Subject</th>
                        <th className="p-4 font-semibold text-center">Attendance %</th>
                        <th className="p-4 font-semibold text-center">Paid Fine (₹)</th>
                        <th className="p-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(item => (
                        <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-4 font-medium text-foreground">{item.profiles?.full_name}</td>
                          <td className="p-4 text-muted-foreground font-mono text-sm">{item.profiles?.roll_number || '—'}</td>
                          <td className="p-4 text-sm">{item.profiles?.departments?.name || '—'}</td>
                          <td className="p-4">
                            <div className="text-sm font-medium">{item.subjects?.subject_name}</div>
                            <div className="text-xs text-muted-foreground">{item.subjects?.subject_code}</div>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-amber-600 dark:text-amber-400 font-bold">{item.attendance_pct}%</span>
                          </td>
                          <td className="p-4 text-center font-bold text-foreground">
                            {item.attendance_fee ? `₹${item.attendance_fee}` : '—'}
                          </td>
                          <td className="p-4">
                            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                              Fine Approved
                            </span>
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

      {/* ========= TEACHER DETAILS TAB ========= */}
      {activeTab === 'teacherDetails' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-violet-500" />
                Teacher Details & Assignments (1st Year)
              </h2>
              <p className="text-muted-foreground text-sm">View teachers you created and their assigned first-year subjects.</p>
            </div>
            <button
              onClick={handleExportTeacherCSV}
              disabled={teacherAssignments.length === 0}
              className="flex items-center gap-2 bg-violet-500 text-white hover:bg-violet-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              Export CSV
            </button>
          </div>

          <div className="relative w-full md:max-w-sm">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by teacher, subject, or section..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-full"
              value={searchTeachers}
              onChange={e => setSearchTeachers(e.target.value)}
            />
          </div>

          {!loadingTeacherDetails && teacherAssignments.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{teacherAssignments.length}</p>
                    <p className="text-xs text-muted-foreground">Total Teachers</p>
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {teacherAssignments.filter(t => t.assignments.length > 0).length}
                    </p>
                    <p className="text-xs text-muted-foreground">With Assignments</p>
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {teacherAssignments.filter(t => t.assignments.length === 0).length}
                    </p>
                    <p className="text-xs text-muted-foreground">No Assignments</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {loadingTeacherDetails ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse bg-card rounded-3xl shadow-sm border border-border">Loading teacher details...</div>
            ) : filteredTeacherDetails.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center bg-card rounded-3xl shadow-sm border border-border">
                <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                  <GraduationCap className="w-10 h-10 text-violet-500/50" />
                </div>
                <h3 className="text-xl font-bold text-foreground">No Teachers Found</h3>
                <p className="text-muted-foreground mt-2">No teachers you created match this criteria.</p>
              </div>
            ) : (
              filteredTeacherDetails.map(teacher => {
                const isExpanded = expandedTeachers.has(teacher.id);
                const hasAssignments = teacher.assignments.length > 0;
                return (
                  <div key={teacher.id} className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden transition-all hover:shadow-md">
                    <button
                      onClick={() => toggleTeacher(teacher.id)}
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg ${
                          hasAssignments ? 'bg-gradient-to-br from-purple-500 to-indigo-600' : 'bg-gradient-to-br from-gray-400 to-gray-500'
                        }`}>
                          {teacher.full_name?.charAt(0)?.toUpperCase() || 'T'}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{teacher.full_name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${roleColors[teacher.role] || 'bg-secondary text-foreground'}`}>
                              {teacher.role}
                            </span>
                            {hasAssignments ? (
                              <span className="text-xs text-muted-foreground">
                                {teacher.assignments.length} subject{teacher.assignments.length !== 1 ? 's' : ''} · {[...new Set(teacher.assignments.flatMap(a => a.sections))].length} section{[...new Set(teacher.assignments.flatMap(a => a.sections))].length !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-amber-500 font-medium">No sections assigned</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border p-5 bg-secondary/10">
                        {!hasAssignments ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">This teacher has no first-year subjects or sections assigned yet.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                                  <th className="p-3 font-semibold">Subject Name</th>
                                  <th className="p-3 font-semibold">Subject Code</th>
                                  <th className="p-3 font-semibold">Semester</th>
                                  <th className="p-3 font-semibold">Assigned Sections</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {teacher.assignments.map((assignment, idx) => (
                                  <tr key={idx} className="hover:bg-secondary/20 transition-colors">
                                    <td className="p-3 font-medium text-foreground">{assignment.subject_name}</td>
                                    <td className="p-3 text-sm text-muted-foreground font-mono">{assignment.subject_code}</td>
                                    <td className="p-3">
                                      <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md text-xs font-bold">
                                        {assignment.semester}
                                      </span>
                                    </td>
                                    <td className="p-3">
                                      <div className="flex flex-wrap gap-1.5">
                                        {assignment.sections.map(sec => (
                                          <span key={sec} className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md text-xs font-bold">
                                            {sec}
                                          </span>
                                        ))}
                                      </div>
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
              })
            )}
          </div>
        </div>
      )}

      {/* ========= ACTIVITY LOGS TAB ========= */}
      {activeTab === 'activityLogs' && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-violet-500" />
              Activity Logs
            </h2>
            <p className="text-muted-foreground text-sm">
              View system activities.
            </p>
          </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <select
                className="px-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-full sm:w-auto"
                value={logRoleFilter}
                onChange={e => setLogRoleFilter(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="clerk">Clerks</option>
                <option value="teacher">Faculty & Teachers</option>
              </select>
              <div className="relative w-full sm:w-64">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 w-full"
                  value={searchLogs}
                  onChange={e => setSearchLogs(e.target.value)}
                />
              </div>
            </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingLogs ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading activity logs...</div>
            ) : (() => {
              const filteredLogs = activityLogs.filter(log => {
                const matchesSearch = log.user_name?.toLowerCase().includes(searchLogs.toLowerCase()) ||
                                      log.action?.toLowerCase().includes(searchLogs.toLowerCase()) ||
                                      log.details?.toLowerCase().includes(searchLogs.toLowerCase());
                const logRole = log.user_role?.toLowerCase() || 'user';
                const matchesRole = logRoleFilter === 'all' 
                                    || (logRoleFilter === 'clerk' && logRole === 'clerk')
                                    || (logRoleFilter === 'teacher' && ['teacher', 'faculty'].includes(logRole));
                return matchesSearch && matchesRole;
              });
              return filteredLogs.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                    <Clock className="w-10 h-10 text-violet-500/50" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">No Logs Found</h3>
                  <p className="text-muted-foreground mt-2">No recent activity matches your search.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                        <th className="p-4 font-semibold">Time</th>
                        <th className="p-4 font-semibold">User</th>
                        <th className="p-4 font-semibold">Role</th>
                        <th className="p-4 font-semibold">Action</th>
                        <th className="p-4 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredLogs.map(log => (
                        <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-4 font-medium text-foreground">{log.user_name || 'Unknown'}</td>
                          <td className="p-4">
                            <span className="px-2 py-1 text-xs rounded-md bg-secondary text-foreground uppercase font-bold">
                              {log.user_role || 'user'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-violet-500/10 text-violet-600">
                              {log.action}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-muted-foreground">{log.details || '—'}</td>
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

    </div>
  );
}
