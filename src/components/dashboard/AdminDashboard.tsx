import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import {
  ShieldCheck, Users, Activity, BookOpen, AlertTriangle,
  Plus, Trash2, Search, UserPlus, X, Building2,
  Settings, Download, GraduationCap, Eye, ChevronDown, ChevronRight, CornerUpLeft
} from 'lucide-react';
import { getFriendlyErrorMessage } from '../../lib/errorHandler';

type TabType = 'overview' | 'departments' | 'hods' | 'subjects' | 'allusers' | 'hallticket';

type Department = {
  id: string;
  name: string;
  hod_id: string | null;
  profiles?: { full_name: string } | null;
};

type UserProfile = {
  id: string;
  full_name: string;
  role: string;
  email?: string;
  department_id: string | null;
  section: string | null;
  created_at: string;
  departments?: { name: string } | null;
};

type Subject = {
  id: string;
  subject_name: string;
  subject_code: string;
  department_id?: string;
  departments?: { name: string } | null;
};

type StudentStatus = {
  id: string;
  student_id: string;
  current_stage: string;
  status: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  profiles: {
    full_name: string;
    department_id: string | null;
    section: string | null;
    departments: { name: string } | null;
  } | null;
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalFaculty: 0,
    pendingFaculty: 0,
    pendingDept: 0,
    pendingHod: 0,
    cleared: 0,
    rejected: 0
  });

  // User Management State (HODs only for creation)
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'hod', department_id: '' });
  const [userCreating, setUserCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Subject Management State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ subject_name: '', subject_code: '', department_id: '' });
  const [subjectCreating, setSubjectCreating] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [subjectSuccess, setSubjectSuccess] = useState<string | null>(null);
  // Hierarchy state for Subjects
  const [selectedDeptSubjects, setSelectedDeptSubjects] = useState<Department | null>(null);
  const [selectedSemSubjects, setSelectedSemSubjects] = useState<any>(null);
  const [semestersList, setSemestersList] = useState<any[]>([]);

  // Department Management State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(false);
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [newDept, setNewDept] = useState({ name: '', hod_id: '' });
  const [deptCreating, setDeptCreating] = useState(false);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [deptSuccess, setDeptSuccess] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // All Users State
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersSearch, setAllUsersSearch] = useState('');
  const [allUsersRoleFilter, setAllUsersRoleFilter] = useState('all');
  // Hierarchy state for All Users
  const [selectedDeptUsers, setSelectedDeptUsers] = useState<string | null>(null); // 'unassigned' or dept id

  // Hall Ticket State
  const [studentStatuses, setStudentStatuses] = useState<StudentStatus[]>([]);
  const [htLoading, setHtLoading] = useState(false);
  const [htSearch, setHtSearch] = useState('');
  const [htError, setHtError] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab === 'hods') fetchUsers();
    if (activeTab === 'subjects') { fetchSubjects(); fetchDepartments(); }
    if (activeTab === 'departments') { fetchDepartments(); fetchUsers(); }
    if (activeTab === 'allusers') fetchAllUsers();
    if (activeTab === 'hallticket') { fetchStudentStatuses(); fetchDepartments(); }
  }, [activeTab]);

  // ==================== ANALYTICS ====================
  const fetchAnalytics = async () => {
    const [studentsRes, facultyRes, reqsRes] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['faculty', 'teacher']),
      supabase.from('clearance_requests').select('status, current_stage'),
    ]);

    let pendF = 0, pendD = 0, pendH = 0, clr = 0, rej = 0;
    if (reqsRes?.data) {
      (reqsRes.data as any[]).forEach((r: any) => {
        if (r.current_stage === 'cleared') clr++;
        else if (r.status === 'rejected') rej++;
        else if (r.current_stage === 'faculty_review') pendF++;
        else if (r.current_stage === 'department_review') pendD++;
        else if (r.current_stage === 'hod_review') pendH++;
      });
    }

    setStats({
      totalStudents: studentsRes.count || 0,
      totalFaculty: facultyRes.count || 0,
      pendingFaculty: pendF,
      pendingDept: pendD,
      pendingHod: pendH,
      cleared: clr,
      rejected: rej
    });
  };

  // ==================== USER MANAGEMENT (HODs) ====================
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').in('role', ['hod', 'admin', 'accounts', 'coe', 'principal', 'librarian']).order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) { console.error('Failed to fetch users:', err); }
    finally { setUsersLoading(false); }
  };

  const handleCreateUser = async () => {
    setUserCreating(true);
    setUserError(null);
    setUserSuccess(null);

    if (!newUser.email || !newUser.password || !newUser.full_name) {
      setUserError('All fields are required.');
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
        department_id: null,
      });
      if (profileError) throw profileError;

      setUserSuccess(`${newUser.role.toUpperCase()} "${newUser.full_name}" created successfully!`);
      setNewUser({ email: '', password: '', full_name: '', role: 'hod', department_id: '' });
      setShowCreateUser(false);
      fetchUsers();
      fetchAnalytics();
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

      const { error } = await supabase.from('profiles').update(updates).eq('id', editingUser.id);
      if (error) throw error;

      if (editingUser.email?.trim()) {
        const { error: rpcError } = await supabase.rpc('admin_update_user_credentials', {
          target_user_id: editingUser.id,
          new_email: editingUser.email.trim(),
          new_password: null
        });
        if (rpcError) throw rpcError;
      }

      setUserSuccess(`User "${editingUser.full_name}" updated!`);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setUserError(getFriendlyErrorMessage(err));
    } finally {
      setUserCreating(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role?.toLowerCase().includes(userSearch.toLowerCase())
  );

  // ==================== SUBJECT MANAGEMENT ====================
  const fetchSubjects = async () => {
    setSubjectsLoading(true);
    try {
      const { data, error } = await supabase.from('subjects').select('*, departments(name), semesters(name)').order('subject_code');
      if (error) throw error;
      setSubjects(data || []);
    } catch (err: any) { console.error('Failed:', err); }
    finally { setSubjectsLoading(false); }
  };

  const fetchSemestersForDept = async (deptId: string) => {
    try {
      const data = await import('../../lib/api').then(m => m.getSemestersByDepartment(deptId));
      setSemestersList(data || []);
    } catch (err) { console.error(err); }
  };

  const handleCreateSubjectWithSem = async () => {
    setSubjectCreating(true);
    setSubjectError(null);
    setSubjectSuccess(null);

    const safeDeptId = selectedDeptSubjects?.id;
    const safeSemId = selectedSemSubjects?.id;

    if (!newSubject.subject_name || !newSubject.subject_code || !safeDeptId || !safeSemId) {
      setSubjectError('Subject name, code, department, and semester are required.');
      setSubjectCreating(false);
      return;
    }

    try {
      const { error } = await supabase.from('subjects').insert([{
        subject_name: newSubject.subject_name,
        subject_code: newSubject.subject_code.toUpperCase(),
        department_id: safeDeptId,
        semester_id: safeSemId
      }] as any);
      if (error) throw error;

      setSubjectSuccess(`Subject "${newSubject.subject_name}" created!`);
      setNewSubject({ subject_name: '', subject_code: '', department_id: '' });
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

    if (!editingSubject.subject_name || !editingSubject.subject_code || !editingSubject.department_id) {
      setSubjectError('Subject name, code, and department are required.');
      setSubjectCreating(false);
      return;
    }

    try {
      const { error } = await supabase.from('subjects').update({
        subject_name: editingSubject.subject_name,
        subject_code: editingSubject.subject_code.toUpperCase(),
        department_id: editingSubject.department_id
      }).eq('id', editingSubject.id);
      if (error) throw error;

      setSubjectSuccess(`Subject "${editingSubject.subject_name}" updated!`);
      setEditingSubject(null);
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(getFriendlyErrorMessage(err));
    } finally {
      setSubjectCreating(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string, subjectName: string) => {
    if (!confirm(`Delete subject "${subjectName}"?`)) return;
    try {
      const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
      if (error) throw error;
      setSubjectSuccess(`"${subjectName}" deleted.`);
      fetchSubjects();
    } catch (err: any) {
      setSubjectError(getFriendlyErrorMessage(err));
    }
  };

  // ==================== DEPARTMENT MANAGEMENT ====================
  const fetchDepartments = async () => {
    setDeptsLoading(true);
    try {
      const { data, error } = await supabase.from('departments').select('*, profiles!departments_hod_id_fkey(full_name)').order('name');
      if (error) throw error;
      setDepartments(data || []);
    } catch (err: any) { console.error('Failed:', err); }
    finally { setDeptsLoading(false); }
  };

  const handleCreateDepartment = async () => {
    setDeptCreating(true);
    setDeptError(null);
    setDeptSuccess(null);

    if (!newDept.name) {
      setDeptError('Department name is required.');
      setDeptCreating(false);
      return;
    }

    try {
      const { data: deptData, error: deptErr } = await supabase.from('departments').insert([{
        name: newDept.name,
        hod_id: newDept.hod_id || null
      }] as any).select().single();
      if (deptErr) throw deptErr;

      if (newDept.hod_id) {
        await supabase.from('profiles').update({ department_id: deptData.id }).eq('id', newDept.hod_id);
      }

      setDeptSuccess(`Department "${newDept.name}" created!`);
      setNewDept({ name: '', hod_id: '' });
      setShowCreateDept(false);
      fetchDepartments();
    } catch (err: any) {
      setDeptError(getFriendlyErrorMessage(err));
    } finally {
      setDeptCreating(false);
    }
  };

  const handleUpdateDepartment = async () => {
    if (!editingDept) return;
    setDeptCreating(true);
    setDeptError(null);

    try {
      const { error } = await supabase.from('departments').update({
        name: editingDept.name,
        hod_id: editingDept.hod_id || null
      }).eq('id', editingDept.id);
      if (error) throw error;

      if (editingDept.hod_id) {
        await supabase.from('profiles').update({ department_id: editingDept.id }).eq('id', editingDept.hod_id);
      }

      setDeptSuccess(`Department "${editingDept.name}" updated!`);
      setEditingDept(null);
      fetchDepartments();
    } catch (err: any) {
      setDeptError(getFriendlyErrorMessage(err));
    } finally {
      setDeptCreating(false);
    }
  };

  const handleDeleteDepartment = async (deptId: string, deptName: string) => {
    if (!confirm(`Delete department "${deptName}"? This will cascade-delete associated data.`)) return;
    try {
      const { error } = await supabase.from('departments').delete().eq('id', deptId);
      if (error) throw error;
      setDeptSuccess(`"${deptName}" deleted.`);
      fetchDepartments();
    } catch (err: any) {
      setDeptError(getFriendlyErrorMessage(err));
    }
  };

  // ==================== ALL USERS ====================
  const fetchAllUsers = async () => {
    setAllUsersLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*, departments!profiles_department_id_fkey(name)').order('created_at', { ascending: false });
      if (error) throw error;
      setAllUsers((data || []) as UserProfile[]);
    } catch (err: any) { console.error(err); }
    finally { setAllUsersLoading(false); }
  };

  const filteredAllUsers = allUsers.filter(u => {
    const matchesSearch = u.full_name?.toLowerCase().includes(allUsersSearch.toLowerCase()) ||
      u.role?.toLowerCase().includes(allUsersSearch.toLowerCase());
    const matchesRole = allUsersRoleFilter === 'all' || u.role === allUsersRoleFilter;
    return matchesSearch && matchesRole;
  });

  // ==================== HALL TICKET STATUS ====================
  const fetchStudentStatuses = async () => {
    setHtLoading(true);
    setHtError(null);
    try {
      // First fetch all clearance requests
      const { data: reqData, error: reqError } = await supabase
        .from('clearance_requests')
        .select('*');
      if (reqError) throw reqError;

      if (!reqData || reqData.length === 0) {
        setStudentStatuses([]);
        return;
      }

      // Then fetch profile info for each student
      const studentIds = reqData.map((r: any) => r.student_id);
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, department_id, section, departments!profiles_department_id_fkey(name)')
        .in('id', studentIds);
      if (profileError) throw profileError;

      // Merge the data
      const profileMap = new Map((profileData || []).map((p: any) => [p.id, p]));
      const merged = reqData.map((r: any) => ({
        ...r,
        profiles: profileMap.get(r.student_id) || null,
      }));

      setStudentStatuses(merged as unknown as StudentStatus[]);
    } catch (err: any) {
      console.error('Hall ticket fetch error:', err);
      setHtError(err.message || 'Failed to load student statuses');
    }
    finally { setHtLoading(false); }
  };

  // Group by department
  const statusesByDept = studentStatuses.reduce((acc, s) => {
    const deptName = s.profiles?.departments?.name || 'Unassigned';
    if (!acc[deptName]) acc[deptName] = [];
    acc[deptName].push(s);
    return acc;
  }, {} as Record<string, StudentStatus[]>);

  const filteredStatusDepts = Object.entries(statusesByDept).filter(([dept, statuses]) =>
    htSearch === '' ||
    dept.toLowerCase().includes(htSearch.toLowerCase()) ||
    statuses.some(s => s.profiles?.full_name?.toLowerCase().includes(htSearch.toLowerCase()))
  );

  const toggleDept = (dept: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // ==================== EXPORT ====================
  const handleExportCSV = async () => {
    try {
      const { data, error } = await supabase
        .from('clearance_requests')
        .select('*, profiles!clearance_requests_student_id_fkey(full_name)');
      if (error) throw error;
      if (!data || data.length === 0) { alert('No data to export.'); return; }
      const header = 'Student Name,Status,Current Stage,Remarks,Created At,Updated At\n';
      const rows = data.map((r: any) =>
        `"${r.profiles?.full_name || 'N/A'}","${r.status}","${r.current_stage}","${r.remarks || ''}","${r.created_at}","${r.updated_at}"`
      ).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clearance_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Export failed: ' + (err.message || 'Unknown error'));
    }
  };

  const roleColors: Record<string, string> = {
    student: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    faculty: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    teacher: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    staff: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    hod: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    admin: 'bg-red-500/10 text-red-600 dark:text-red-400',
    coe: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  };

  const stageColors: Record<string, string> = {
    student_application: 'bg-gray-500/10 text-gray-600',
    faculty_review: 'bg-amber-500/10 text-amber-600',
    department_review: 'bg-blue-500/10 text-blue-600',
    hod_review: 'bg-purple-500/10 text-purple-600',
    cleared: 'bg-emerald-500/10 text-emerald-600',
    rejected: 'bg-red-500/10 text-red-600',
  };

  const stageLabels: Record<string, string> = {
    student_application: 'Application',
    faculty_review: 'Faculty Review',
    department_review: 'Dept Review',
    hod_review: 'HOD Review',
    cleared: '✓ Cleared',
    rejected: '✗ Rejected',
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'departments', label: 'Departments', icon: <Building2 className="w-4 h-4" /> },
    { id: 'hods', label: 'Core Staff', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'allusers', label: 'All Users', icon: <Eye className="w-4 h-4" /> },
    { id: 'hallticket', label: 'Hall Tickets', icon: <GraduationCap className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
            <ShieldCheck className="w-8 h-8 mr-3 text-primary" />
            Admin Control Panel
          </h1>
          <p className="text-muted-foreground">Manage departments, HODs, subjects, and monitor the clearance pipeline.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-5 py-3 rounded-xl font-medium border border-border transition-all shadow-sm">
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Export</span>
          </button>
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
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ========= OVERVIEW TAB ========= */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Students" value={stats.totalStudents} icon={<Users />} color="text-blue-500" bg="bg-blue-500/10" border="border-blue-500/20" />
            <StatCard title="Fully Cleared" value={stats.cleared} icon={<Activity />} color="text-emerald-500" bg="bg-emerald-500/10" border="border-emerald-500/20" />
            <StatCard title="Rejected" value={stats.rejected} icon={<AlertTriangle />} color="text-destructive" bg="bg-destructive/10" border="border-destructive/20" />
            <StatCard title="Pending Faculty" value={stats.pendingFaculty} icon={<BookOpen />} color="text-amber-500" bg="bg-amber-500/10" border="border-amber-500/20" />
          </div>
          <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
            <h2 className="text-xl font-bold text-foreground mb-6">Pipeline Bottlenecks</h2>
            <div className="space-y-4">
              <PipelineBar label="Faculty Review" count={stats.pendingFaculty} total={stats.totalStudents || 1} color="bg-amber-500" />
              <PipelineBar label="Department Review" count={stats.pendingDept} total={stats.totalStudents || 1} color="bg-blue-500" />
              <PipelineBar label="HOD Review" count={stats.pendingHod} total={stats.totalStudents || 1} color="bg-emerald-500" />
            </div>
          </div>
        </>
      )}

      {/* ========= DEPARTMENTS TAB ========= */}
      {activeTab === 'departments' && (
        <div className="space-y-6">
          {deptSuccess && <AlertBanner type="success" message={deptSuccess} onClose={() => setDeptSuccess(null)} />}

          <div className="flex justify-between items-center">
            <p className="text-muted-foreground text-sm">{departments.length} departments</p>
            <button onClick={() => setShowCreateDept(true)} className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-3 rounded-xl font-bold transition-all shadow-sm">
              <Plus className="w-5 h-5" />
              Add Department
            </button>
          </div>

          {/* Create Department Modal */}
          {showCreateDept && (
            <Modal title="Add New Department" icon={<Building2 className="w-5 h-5 text-primary" />} onClose={() => setShowCreateDept(false)}>
              {deptError && <div className="mb-4"><AlertBanner type="error" message={deptError} onClose={() => setDeptError(null)} /></div>}
              <div className="space-y-4">
                <FormField label="Department Name">
                  <input type="text" className="modal-input" placeholder="e.g. Computer Science" value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} />
                </FormField>
                <FormField label="Assign HOD (Optional)">
                  <select className="modal-input" value={newDept.hod_id} onChange={e => setNewDept({ ...newDept, hod_id: e.target.value })}>
                    <option value="">Select HOD...</option>
                    {users.filter(u => u.role === 'hod').map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                  {users.filter(u => u.role === 'hod').length === 0 && <p className="text-xs text-amber-500 mt-2">No HODs found. Create one first.</p>}
                </FormField>
              </div>
              <ModalActions onCancel={() => setShowCreateDept(false)} onSubmit={handleCreateDepartment} loading={deptCreating} label="Save Department" />
            </Modal>
          )}

          {/* Edit Department Modal */}
          {editingDept && (
            <Modal title="Edit Department" icon={<Building2 className="w-5 h-5 text-primary" />} onClose={() => setEditingDept(null)}>
              {deptError && <div className="mb-4"><AlertBanner type="error" message={deptError} onClose={() => setDeptError(null)} /></div>}
              <div className="space-y-4">
                <FormField label="Department Name">
                  <input type="text" className="modal-input" value={editingDept.name} onChange={e => setEditingDept({ ...editingDept, name: e.target.value })} />
                </FormField>
                <FormField label="Assign HOD">
                  <select className="modal-input" value={editingDept.hod_id || ''} onChange={e => setEditingDept({ ...editingDept, hod_id: e.target.value })}>
                    <option value="">Select HOD...</option>
                    {users.filter(u => u.role === 'hod').map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </FormField>
              </div>
              <ModalActions onCancel={() => setEditingDept(null)} onSubmit={handleUpdateDepartment} loading={deptCreating} label="Update Department" />
            </Modal>
          )}

          {/* Departments Table */}
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {deptsLoading ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading departments...</div>
            ) : departments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No departments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">Assigned HOD</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {departments.map(d => (
                      <tr key={d.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-bold text-foreground">{d.name}</td>
                        <td className="p-4 font-medium text-muted-foreground">{d.profiles?.full_name || 'Unassigned'}</td>
                        <td className="p-4 text-right">
                          <button onClick={() => setEditingDept(d)} className="p-2 mr-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors" title="Edit">
                            <Settings className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteDepartment(d.id, d.name)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors" title="Delete">
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

      {/* ========= HODs TAB ========= */}
      {activeTab === 'hods' && (
        <div className="space-y-6">
          {userSuccess && <AlertBanner type="success" message={userSuccess} onClose={() => setUserSuccess(null)} />}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="relative flex-1 w-full md:max-w-xs">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search HODs..." className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary w-full" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            </div>
            <button onClick={() => setShowCreateUser(true)} className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-3 rounded-xl font-bold transition-all shadow-sm">
              <UserPlus className="w-5 h-5" />
              Create Core Staff
            </button>
          </div>

          {/* Create User Modal */}
          {showCreateUser && (
            <Modal title="Create Core Staff" icon={<UserPlus className="w-5 h-5 text-primary" />} onClose={() => setShowCreateUser(false)}>
              {userError && <div className="mb-4"><AlertBanner type="error" message={userError} onClose={() => setUserError(null)} /></div>}
              <div className="space-y-4">
                <FormField label="Role">
                  <select className="modal-input" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="hod">HOD (Head of Department)</option>
                    <option value="accounts">Accounts Staff</option>
                    <option value="coe">Controller of Examination (COE)</option>
                    <option value="librarian">Librarian</option>
                  </select>
                </FormField>
                <FormField label="Full Name">
                  <input type="text" className="modal-input" placeholder="e.g. Prof. Johnson" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} />
                </FormField>
                <FormField label="Email">
                  <input type="email" className="modal-input" placeholder="hod@example.com" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value.trim() })} />
                </FormField>
                <FormField label="Password">
                  <input type="password" className="modal-input" placeholder="Min 6 characters" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                </FormField>
                <p className="text-sm text-muted-foreground italic">Users are created globally. Assign HODs to a department in the Departments tab.</p>
              </div>
              <ModalActions onCancel={() => setShowCreateUser(false)} onSubmit={handleCreateUser} loading={userCreating} label="Create Staff" />
            </Modal>
          )}

          {/* Edit User Modal */}
          {editingUser && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-lg">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Settings className="w-5 h-5 text-amber-500" />
                    Edit User
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

          {/* Staff Table */}
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {usersLoading ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading core staff...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No core staff found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">Role</th>
                      <th className="p-4 font-semibold">Department</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-medium text-foreground">{u.full_name}</td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleColors[u.role] || 'bg-secondary text-foreground'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-4 text-muted-foreground">{departments.find(d => d.hod_id === u.id)?.name || '—'}</td>
                        <td className="p-4 text-right">
                          {u.role !== 'admin' && (
                            <>
                              <button onClick={() => setEditingUser(u)} className="p-2 mr-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors" title="Edit">
                                <Settings className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteUser(u.id, u.full_name)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
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

      {/* ========= SUBJECTS TAB ========= */}
      {activeTab === 'subjects' && (
        <div className="space-y-6">
          {subjectSuccess && <AlertBanner type="success" message={subjectSuccess} onClose={() => setSubjectSuccess(null)} />}

          <div className="flex justify-between items-center bg-card p-4 rounded-2xl shadow-sm border border-border">
            <div className="flex items-center gap-3">
               {selectedSemSubjects ? (
                 <button onClick={() => setSelectedSemSubjects(null)} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
                   <CornerUpLeft className="w-5 h-5" /> Back to Semesters
                 </button>
               ) : selectedDeptSubjects ? (
                 <button onClick={() => setSelectedDeptSubjects(null)} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
                   <CornerUpLeft className="w-5 h-5" /> Back to Departments
                 </button>
               ) : (
                 <p className="text-foreground font-bold pl-2">Select a Department</p>
               )}
            </div>
            
            {selectedSemSubjects && (
               <button onClick={() => setShowCreateSubject(true)} className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-3 rounded-xl font-bold transition-all shadow-sm">
                 <Plus className="w-5 h-5" />
                 Add Subject
               </button>
            )}
          </div>

          {/* Create Subject Modal */}
          {showCreateSubject && (
            <Modal title="Add New Subject" icon={<BookOpen className="w-5 h-5 text-primary" />} onClose={() => setShowCreateSubject(false)}>
              {subjectError && <div className="mb-4"><AlertBanner type="error" message={subjectError} onClose={() => setSubjectError(null)} /></div>}
              <div className="space-y-4">
                <FormField label="Subject Code">
                  <input type="text" className="modal-input uppercase" placeholder="e.g. CS101" value={newSubject.subject_code} onChange={e => setNewSubject({ ...newSubject, subject_code: e.target.value })} />
                </FormField>
                <FormField label="Subject Name">
                  <input type="text" className="modal-input" placeholder="e.g. Introduction to Programming" value={newSubject.subject_name} onChange={e => setNewSubject({ ...newSubject, subject_name: e.target.value })} />
                </FormField>
                <FormField label="Department">
                  <div className="modal-input bg-secondary opacity-70 cursor-not-allowed">
                     {selectedDeptSubjects?.name}
                  </div>
                </FormField>
                <FormField label="Semester">
                  <div className="modal-input bg-secondary opacity-70 cursor-not-allowed">
                     {selectedSemSubjects?.name}
                  </div>
                </FormField>
              </div>
              <ModalActions onCancel={() => setShowCreateSubject(false)} onSubmit={() => {
                 setNewSubject(prev => ({ ...prev, department_id: selectedDeptSubjects?.id || '' }));
                 // We need to support semester saving in handleCreateSubject. For this MVP, we pass it indirectly or handleCreateSubject uses selected context.
                 // So we update handleCreateSubject manually. We will re-use handleCreateSubject but inject semester_id.
                 handleCreateSubjectWithSem();
              }} loading={subjectCreating} label="Save Subject" />
            </Modal>
          )}

          {/* Edit Subject Modal */}
          {editingSubject && (
            <Modal title="Edit Subject" icon={<BookOpen className="w-5 h-5 text-primary" />} onClose={() => setEditingSubject(null)}>
              {subjectError && <div className="mb-4"><AlertBanner type="error" message={subjectError} onClose={() => setSubjectError(null)} /></div>}
              <div className="space-y-4">
                <FormField label="Subject Code">
                  <input type="text" className="modal-input uppercase" value={editingSubject.subject_code} onChange={e => setEditingSubject({ ...editingSubject, subject_code: e.target.value })} />
                </FormField>
                <FormField label="Subject Name">
                  <input type="text" className="modal-input" value={editingSubject.subject_name} onChange={e => setEditingSubject({ ...editingSubject, subject_name: e.target.value })} />
                </FormField>
              </div>
              <ModalActions onCancel={() => setEditingSubject(null)} onSubmit={handleUpdateSubject} loading={subjectCreating} label="Update Subject" />
            </Modal>
          )}

          {/* Views */}
          {!selectedDeptSubjects ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {departments.map((dept) => (
                  <button key={dept.id} onClick={() => { setSelectedDeptSubjects(dept); fetchSemestersForDept(dept.id); }} className="bg-card p-6 rounded-3xl shadow-sm border border-border hover:border-primary/50 hover:shadow-md transition-all text-left group">
                     <Building2 className="w-8 h-8 text-primary mb-4" />
                     <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{dept.name}</h3>
                     <p className="text-muted-foreground mt-2">{subjects.filter(s => s.department_id === dept.id).length} subjects total</p>
                  </button>
                ))}
             </div>
          ) : !selectedSemSubjects ? (
             <div className="space-y-4">
               <h3 className="text-xl font-bold text-foreground">Select a Semester for {selectedDeptSubjects.name}</h3>
               {semestersList.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground bg-card rounded-3xl border border-border">No semesters found in this department. Create them via HOD login.</div>
               ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {semestersList.map(sem => (
                      <button key={sem.id} onClick={() => setSelectedSemSubjects(sem)} className="bg-card p-5 rounded-2xl shadow-sm border border-border hover:border-primary/50 transition-all text-left flex items-center justify-between group">
                        <span className="font-bold text-foreground group-hover:text-primary">{sem.name}</span>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                      </button>
                    ))}
                  </div>
               )}
             </div>
          ) : (
             <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
               {subjectsLoading ? (
                 <div className="p-8 text-center text-muted-foreground animate-pulse">Loading subjects...</div>
               ) : subjects.filter(s => s.department_id === selectedDeptSubjects.id && (s as any).semester_id === selectedSemSubjects.id).length === 0 ? (
                 <div className="p-8 text-center text-muted-foreground">No subjects found for this semester.</div>
               ) : (
                 <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                     <thead>
                       <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                         <th className="p-4 font-semibold">Code</th>
                         <th className="p-4 font-semibold">Name</th>
                         <th className="p-4 font-semibold text-right">Actions</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-border">
                       {subjects.filter(s => s.department_id === selectedDeptSubjects.id && (s as any).semester_id === selectedSemSubjects.id).map(sub => (
                         <tr key={sub.id} className="hover:bg-secondary/20 transition-colors">
                           <td className="p-4 font-bold text-foreground">{sub.subject_code}</td>
                           <td className="p-4 font-medium text-muted-foreground">{sub.subject_name}</td>
                           <td className="p-4 text-right">
                             <button onClick={() => setEditingSubject(sub)} className="p-2 mr-2 rounded-xl bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-colors" title="Edit">
                               <Settings className="w-4 h-4" />
                             </button>
                             <button onClick={() => handleDeleteSubject(sub.id, sub.subject_name)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors" title="Delete">
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
        </div>
      )}

      {/* ========= ALL USERS TAB ========= */}
      {activeTab === 'allusers' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
            <div className="flex items-center gap-3">
               {selectedDeptUsers ? (
                 <button onClick={() => setSelectedDeptUsers(null)} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium">
                   <CornerUpLeft className="w-5 h-5" /> Back to Departments
                 </button>
               ) : (
                 <p className="text-foreground font-bold pl-2">Select a Department to View Users</p>
               )}
            </div>

            {selectedDeptUsers && (
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="relative flex-1 w-full md:w-64">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="text" placeholder="Search users..." className="pl-10 pr-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary w-full text-sm" value={allUsersSearch} onChange={e => setAllUsersSearch(e.target.value)} />
                </div>
                <select
                  className="px-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium"
                  value={allUsersRoleFilter}
                  onChange={e => setAllUsersRoleFilter(e.target.value)}
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="principal">Principal</option>
                  <option value="hod">HOD</option>
                  <option value="coe">COE</option>
                  <option value="accounts">Accounts</option>
                  <option value="librarian">Librarian</option>
                  <option value="staff">Staff</option>
                  <option value="teacher">Teacher</option>
                  <option value="faculty">Faculty</option>
                  <option value="student">Student</option>
                </select>
              </div>
            )}
          </div>

          {!selectedDeptUsers ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button onClick={() => setSelectedDeptUsers('unassigned')} className="bg-card p-6 rounded-3xl shadow-sm border border-border hover:border-amber-500/50 hover:shadow-md transition-all text-left flex flex-col items-start min-h-[160px] group relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none"></div>
                   <ShieldCheck className="w-8 h-8 text-amber-500 mb-4" />
                   <h3 className="text-xl font-bold text-foreground group-hover:text-amber-500 transition-colors">Global Users</h3>
                   <p className="text-muted-foreground mt-auto">{allUsers.filter(u => !u.department_id).length} unassigned users (Admins, etc)</p>
                </button>
                {departments.map((dept) => (
                  <button key={dept.id} onClick={() => setSelectedDeptUsers(dept.id)} className="bg-card p-6 rounded-3xl shadow-sm border border-border hover:border-primary/50 hover:shadow-md transition-all text-left flex flex-col items-start min-h-[160px] group relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none"></div>
                     <Building2 className="w-8 h-8 text-primary mb-4" />
                     <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{dept.name}</h3>
                     <p className="text-muted-foreground mt-auto">{allUsers.filter(u => u.department_id === dept.id).length} users total</p>
                  </button>
                ))}
             </div>
          ) : (
            <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
              {allUsersLoading ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse">Loading users...</div>
              ) : filteredAllUsers.filter(u => selectedDeptUsers === 'unassigned' ? !u.department_id : u.department_id === selectedDeptUsers).length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No users match the criteria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                        <th className="p-4 font-semibold">Name</th>
                        <th className="p-4 font-semibold">Role</th>
                        <th className="p-4 font-semibold">Section</th>
                        <th className="p-4 font-semibold">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredAllUsers.filter(u => selectedDeptUsers === 'unassigned' ? !u.department_id : u.department_id === selectedDeptUsers).map(u => (
                        <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-4 font-medium text-foreground">{u.full_name}</td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleColors[u.role] || 'bg-secondary text-foreground'}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-4 text-muted-foreground">{u.section || '—'}</td>
                          <td className="p-4 text-muted-foreground text-sm">{new Date(u.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-4 py-3 bg-secondary/30 border-t border-border text-sm text-muted-foreground">
                Showing {filteredAllUsers.filter(u => selectedDeptUsers === 'unassigned' ? !u.department_id : u.department_id === selectedDeptUsers).length} users
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========= HALL TICKET STATUS TAB ========= */}
      {activeTab === 'hallticket' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-primary" />
                Student Clearance Status by Branch
              </h2>
              <p className="text-muted-foreground text-sm mt-1">Click a department to expand and see individual student statuses.</p>
            </div>
            <div className="relative w-full md:max-w-xs">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search student or department..." className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary w-full" value={htSearch} onChange={e => setHtSearch(e.target.value)} />
            </div>
          </div>

          {htError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm mb-4">
              <strong>Error:</strong> {htError}
            </div>
          )}

          {htLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading student statuses...</div>
          ) : filteredStatusDepts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground bg-card rounded-3xl border border-border">No clearance requests found. Students need to apply for clearance first.</div>
          ) : (
            <div className="space-y-4">
              {filteredStatusDepts.map(([dept, statuses]) => {
                const cleared = statuses.filter(s => s.current_stage === 'cleared').length;
                const rejected = statuses.filter(s => s.status === 'rejected').length;
                const pending = statuses.length - cleared - rejected;
                const isExpanded = expandedDepts.has(dept);

                return (
                  <div key={dept} className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                    <button
                      onClick={() => toggleDept(dept)}
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{dept}</h3>
                          <p className="text-sm text-muted-foreground">{statuses.length} students</p>
                        </div>
                      </div>
                      <div className="flex gap-3 text-sm font-medium">
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600">✓ {cleared}</span>
                        <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-600">⏳ {pending}</span>
                        {rejected > 0 && <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-600">✗ {rejected}</span>}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-secondary/30 text-foreground text-sm border-b border-border">
                              <th className="p-4 font-semibold">Student</th>
                              <th className="p-4 font-semibold">Section</th>
                              <th className="p-4 font-semibold">Current Stage</th>
                              <th className="p-4 font-semibold">Status</th>
                              <th className="p-4 font-semibold">Applied</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {statuses.map(s => (
                              <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                                <td className="p-4 font-medium text-foreground">{s.profiles?.full_name || 'Unknown'}</td>
                                <td className="p-4 text-muted-foreground">{s.profiles?.section || '—'}</td>
                                <td className="p-4">
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${stageColors[s.current_stage] || 'bg-secondary text-foreground'}`}>
                                    {stageLabels[s.current_stage] || s.current_stage}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                    s.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                                    s.status === 'rejected' ? 'bg-red-500/10 text-red-600' :
                                    'bg-amber-500/10 text-amber-600'
                                  }`}>
                                    {s.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-4 text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
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
      )}
    </div>
  );
}

// ==================== REUSABLE COMPONENTS ====================

function StatCard({ title, value, icon, color, bg, border }: any) {
  return (
    <div className={`rounded-3xl p-6 shadow-sm border hover:shadow-md transition-shadow bg-card ${border}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        <div className={`p-3 rounded-xl ${bg} ${color}`}>
          {icon && typeof icon === 'object' ? <span className="w-5 h-5 block">{icon}</span> : null}
        </div>
      </div>
      <p className="text-4xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function PipelineBar({ label, count, total, color }: any) {
  const pct = Math.min((count / total) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground font-bold">{count} pending</span>
      </div>
      <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
}

function AlertBanner({ type, message, onClose }: { type: 'error' | 'success'; message: string; onClose: () => void }) {
  const cls = type === 'error'
    ? 'bg-destructive/10 border-destructive/20 text-destructive'
    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400';
  return (
    <div className={`p-4 border rounded-xl text-sm flex justify-between items-center ${cls}`}>
      <span>{type === 'error' ? <strong>Error: </strong> : '✓ '}{message}</span>
      <button onClick={onClose}><X className="w-4 h-4" /></button>
    </div>
  );
}

function Modal({ title, icon, onClose, children }: { title: string; icon: any; onClose: () => void; children: any }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            {icon} {title}
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onSubmit, loading, label }: { onCancel: () => void; onSubmit: () => void; loading: boolean; label: string }) {
  return (
    <div className="flex gap-3 mt-8">
      <button onClick={onCancel} className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all">Cancel</button>
      <button onClick={onSubmit} disabled={loading} className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all disabled:opacity-50">
        {loading ? 'Saving...' : label}
      </button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
