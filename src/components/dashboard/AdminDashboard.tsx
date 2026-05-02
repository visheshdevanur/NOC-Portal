import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

import {
  ShieldCheck, Users, Activity, BookOpen, AlertTriangle,
  Plus, Trash2, Search, UserPlus, X, Building2,
  Settings, Download, GraduationCap, Eye, ChevronDown, ChevronRight, CornerUpLeft, ArrowUpCircle
} from 'lucide-react';
import { getFriendlyErrorMessage } from '../../lib/errorHandler';

type TabType = 'overview' | 'departments' | 'hods' | 'subjects' | 'allusers' | 'hallticket' | 'logs' | 'academic';

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
  semesters?: { name: string } | null;
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
  // Semester Creation State
  const [showCreateSemester, setShowCreateSemester] = useState(false);
  const [newSemesterName, setNewSemesterName] = useState('');
  const [semesterCreating, setSemesterCreating] = useState(false);
  const [semesterError, setSemesterError] = useState<string | null>(null);
  const [semesterSuccess, setSemesterSuccess] = useState<string | null>(null);

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
  const [teacherCreatorRoles, setTeacherCreatorRoles] = useState<Record<string, string>>({});
  // Hierarchy state for All Users
  const [expandedAllUsersSections, setExpandedAllUsersSections] = useState<Set<string>>(new Set(['global', 'first_year']));

  // Hall Ticket State
  const [studentStatuses, setStudentStatuses] = useState<StudentStatus[]>([]);
  const [htLoading, setHtLoading] = useState(false);
  const [htSearch, setHtSearch] = useState('');
  const [htError, setHtError] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  // System Logs State
  const [adminLogs, setAdminLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsDeptFilter, setLogsDeptFilter] = useState('all');
  const [logsRoleFilter, setLogsRoleFilter] = useState('all');
  const [logsUserFilter, setLogsUserFilter] = useState('all');
  const [logsUsersList, setLogsUsersList] = useState<{id: string, name: string}[]>([]);

  // Academic Management State
  const [promotionPreview, setPromotionPreview] = useState<any[]>([]);
  const [graduatedStudents, setGraduatedStudents] = useState<any[]>([]);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promotionResult, setPromotionResult] = useState<any>(null);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [academicSuccess, setAcademicSuccess] = useState<string | null>(null);
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const [expandedGradDepts, setExpandedGradDepts] = useState<Set<string>>(new Set());
  const [expandedGradBatches, setExpandedGradBatches] = useState<Set<string>>(new Set());
  const [exportingPreData, setExportingPreData] = useState(false);


  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab === 'hods') fetchUsers();
    if (activeTab === 'subjects') { fetchSubjects(); fetchDepartments(); }
    if (activeTab === 'departments') { fetchDepartments(); fetchUsers(); }
    if (activeTab === 'allusers') { fetchAllUsers(); fetchDepartments(); }
    if (activeTab === 'hallticket') { fetchStudentStatuses(); fetchDepartments(); }
    if (activeTab === 'logs') fetchAdminLogs();
    if (activeTab === 'academic') { fetchPromotionPreview(); fetchGraduatedStudents(); fetchDepartments(); }
  }, [activeTab]);

  // ==================== SYSTEM LOGS ====================
  // Admin should only see logs from COE, Librarian, HOD, and Accounts
  const ADMIN_VISIBLE_ROLES = ['coe', 'librarian', 'hod', 'accounts'];
  const fetchAdminLogs = async () => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabase.from('activity_logs').select('*').in('user_role', ADMIN_VISIBLE_ROLES).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      setAdminLogs(data || []);
    } catch (err: any) { console.error('Failed to fetch logs:', err); }
    finally { setLogsLoading(false); }
  };

  useEffect(() => {
    if (activeTab !== 'logs') return;
    const usersMap = new Map<string, string>();
    adminLogs.forEach(log => {
      const role = log.user_role || 'unknown';
      const userDept = log.department_id || null;
      
      let deptMatch = false;
      if (logsDeptFilter === 'all') deptMatch = true;
      else if (logsDeptFilter === 'accounts' && role === 'accounts') deptMatch = true;
      else if (logsDeptFilter === 'coe' && role === 'coe') deptMatch = true;
      else if (logsDeptFilter === 'library' && role === 'librarian') deptMatch = true;
      else if (logsDeptFilter === userDept) deptMatch = true;

      if (deptMatch) {
         let roleMatch = false;
         if (logsRoleFilter === 'all') roleMatch = true;
         else if (logsRoleFilter === 'faculty' && (role === 'faculty' || role === 'teacher')) roleMatch = true;
         else if (role === logsRoleFilter) roleMatch = true;

         if (roleMatch) {
           if (log.user_id && log.user_name) {
             usersMap.set(log.user_id, log.user_name);
           }
         }
      }
    });
    setLogsUsersList(Array.from(usersMap.entries()).map(([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name)));
    // Auto-reset user filter if the previously selected user doesn't belong to the new role filter
    if (logsUserFilter !== 'all') {
      if (!Array.from(usersMap.keys()).includes(logsUserFilter)) {
        setLogsUserFilter('all');
      }
    }
  }, [adminLogs, logsDeptFilter, logsRoleFilter, activeTab]);

  const filteredLogs = adminLogs.filter(log => {
    // Only show COE, librarian, HOD, and accounts logs (already filtered at fetch level, but double-check)
    if (!ADMIN_VISIBLE_ROLES.includes(log.user_role)) return false;
    
    let deptMatch = false;
    if (logsDeptFilter === 'all') deptMatch = true;
    else if (logsDeptFilter === 'accounts' && log.user_role === 'accounts') deptMatch = true;
    else if (logsDeptFilter === 'coe' && log.user_role === 'coe') deptMatch = true;
    else if (logsDeptFilter === 'library' && log.user_role === 'librarian') deptMatch = true;
    else if (logsDeptFilter === log.department_id) deptMatch = true;

    if (!deptMatch) return false;

    let roleMatch = false;
    if (logsRoleFilter === 'all') roleMatch = true;
    else if (log.user_role === logsRoleFilter) roleMatch = true;

    if (!roleMatch) return false;
    if (logsUserFilter !== 'all' && log.user_id !== logsUserFilter) return false;
    return true;
  });

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
      const { tempSupabase } = await import('../../lib/supabase');

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

  const handleAdminCreateSemester = async (massCreate: boolean = false) => {
    if (!newSemesterName.trim()) {
      setSemesterError('Semester name is required.');
      return;
    }
    if (!massCreate && !selectedDeptSubjects?.id) {
      setSemesterError('No department selected.');
      return;
    }
    setSemesterCreating(true);
    setSemesterError(null);
    setSemesterSuccess(null);
    try {
      if (massCreate) {
        // Create the same semester in ALL departments
        const names = newSemesterName.split(',').map(n => n.trim()).filter(n => n.length > 0);
        const rows = departments.flatMap(dept =>
          names.map(name => ({ name, department_id: dept.id }))
        );
        const { error } = await supabase.from('semesters').upsert(rows, { onConflict: 'name,department_id', ignoreDuplicates: true });
        if (error) throw error;
        setSemesterSuccess(`Created ${names.length} semester(s) across ${departments.length} departments!`);
      } else {
        // Single department
        const names = newSemesterName.split(',').map(n => n.trim()).filter(n => n.length > 0);
        const rows = names.map(name => ({ name, department_id: selectedDeptSubjects!.id }));
        const { error } = await supabase.from('semesters').upsert(rows, { onConflict: 'name,department_id', ignoreDuplicates: true });
        if (error) throw error;
        setSemesterSuccess(`Created ${names.length} semester(s) for ${selectedDeptSubjects!.name}!`);
        fetchSemestersForDept(selectedDeptSubjects!.id);
      }
      setNewSemesterName('');
      setShowCreateSemester(false);
    } catch (err: any) {
      setSemesterError(getFriendlyErrorMessage(err));
    } finally {
      setSemesterCreating(false);
    }
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
      const { data, error } = await supabase.from('profiles').select('*, departments!profiles_department_id_fkey(name), semesters!profiles_semester_id_fkey(name)').order('created_at', { ascending: false });
      if (error) throw error;
      setAllUsers((data || []) as UserProfile[]);

      // Fetch imported teachers mapping to know who created them
      const { data: imported } = await supabase.from('imported_teachers').select('teacher_id, created_by');
      if (imported && imported.length > 0) {
        const creatorIds = [...new Set(imported.map(i => i.created_by).filter(Boolean))];
        if (creatorIds.length > 0) {
          const { data: creators } = await supabase.from('profiles').select('id, role').in('id', creatorIds);
          const creatorRoleMap = Object.fromEntries((creators || []).map(c => [c.id, c.role]));
          const tMap = Object.fromEntries(imported.map(i => [i.teacher_id, creatorRoleMap[i.created_by] || 'unknown']));
          setTeacherCreatorRoles(tMap);
        }
      }
    } catch (err: any) { console.error(err); }
    finally { setAllUsersLoading(false); }
  };

  const filteredAllUsers = allUsers.filter(u => {
    const matchesSearch = u.full_name?.toLowerCase().includes(allUsersSearch.toLowerCase()) ||
      u.role?.toLowerCase().includes(allUsersSearch.toLowerCase());
    return matchesSearch;
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

  // ==================== ACADEMIC MANAGEMENT ====================
  const fetchPromotionPreview = async () => {
    setAcademicLoading(true);
    try {
      const { getPromotionPreview } = await import('../../lib/api');
      const data = await getPromotionPreview();
      setPromotionPreview(data || []);
    } catch (err: any) { console.error('Failed to fetch promotion preview:', err); }
    finally { setAcademicLoading(false); }
  };

  const fetchGraduatedStudents = async () => {
    try {
      const { getActiveStudentsDetails } = await import('../../lib/api');
      const data = await getActiveStudentsDetails();
      setGraduatedStudents(data || []);
    } catch (err: any) { console.error('Failed to fetch students details:', err); }
  };

  const handleExportPreData = async () => {
    setExportingPreData(true);
    setAcademicError(null);
    try {
      const { getPrePromotionData } = await import('../../lib/api');
      const data = await getPrePromotionData();
      // Build CSV from students data
      const students = data?.students || [];
      if (students.length === 0) { setAcademicError('No student data to export.'); return; }
      const header = 'Name,Roll Number,Department,Semester,Section,Clearance Stage,Clearance Status\n';
      const rows = students.map((s: any) =>
        `"${s.full_name || ''}","${s.roll_number || ''}","${s.department || ''}","${s.semester || ''}","${s.section || ''}","${s.clearance_stage || ''}","${s.clearance_status || ''}"`
      ).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pre_promotion_data_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAcademicSuccess('Pre-promotion data downloaded successfully!');
    } catch (err: any) {
      setAcademicError(getFriendlyErrorMessage(err));
    } finally { setExportingPreData(false); }
  };

  const handlePromoteAll = async () => {
    setPromoting(true);
    setAcademicError(null);
    setAcademicSuccess(null);
    setPromotionResult(null);
    try {
      const { promoteAllStudents: doPromote } = await import('../../lib/api');
      const result = await doPromote();
      setPromotionResult(result);
      setAcademicSuccess(`Promotion complete! ${result.total_promoted} promoted, ${result.total_graduated} graduated.`);
      setShowPromoteConfirm(false);
      fetchPromotionPreview();
      fetchGraduatedStudents();
      fetchAnalytics();
    } catch (err: any) {
      setAcademicError(getFriendlyErrorMessage(err));
    } finally { setPromoting(false); }
  };

  const handleExportGraduatedCSV = (students: any[]) => {
    if (students.length === 0) { alert('No students to export.'); return; }
    const header = 'Name,Roll Number,Department,Semester,Section,Enrolled\n';
    const rows = students.map((s: any) =>
      `"${s.full_name || ''}","${s.roll_number || ''}","${s.departments?.name || ''}","${s.semesters?.name || ''}","${s.section || ''}","${new Date(s.created_at).toLocaleDateString()}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students_details_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };



  // Build promotion preview summary
  const promotionSummary = (() => {
    const byDeptSem: Record<string, Record<string, number>> = {};
    for (const s of promotionPreview) {
      const dept = (s as any).departments?.name || 'Unassigned';
      const sem = (s as any).semesters?.name || 'Unassigned';
      if (!byDeptSem[dept]) byDeptSem[dept] = {};
      byDeptSem[dept][sem] = (byDeptSem[dept][sem] || 0) + 1;
    }
    return byDeptSem;
  })();

  // Group active students by dept then semester
  const graduatedByDeptBatch = (() => {
    const groups: Record<string, Record<string, any[]>> = {};
    for (const s of graduatedStudents) {
      const dept = s.departments?.name || 'Unassigned';
      const batch = s.semesters?.name || 'Unassigned';
      if (!groups[dept]) groups[dept] = {};
      if (!groups[dept][batch]) groups[dept][batch] = [];
      groups[dept][batch].push(s);
    }
    return groups;
  })();

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
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
    { id: 'academic', label: 'Academic', icon: <ArrowUpCircle className="w-4 h-4" /> },
    { id: 'departments', label: 'Departments', icon: <Building2 className="w-4 h-4" /> },
    { id: 'hods', label: 'Core Staff', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'allusers', label: 'All Users', icon: <Eye className="w-4 h-4" /> },
    { id: 'hallticket', label: 'Hall Tickets', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'logs', label: 'Activity Logs', icon: <Activity className="w-4 h-4" /> },
  ];

  const renderUsersTable = (usersList: UserProfile[]) => {
    if (usersList.length === 0) return <p className="text-sm text-muted-foreground italic p-3">No users found in this category.</p>;
    return (
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-secondary/50 text-foreground border-b border-border">
              <th className="p-3 font-semibold">Name</th>
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold">Section/Sem</th>
              <th className="p-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {usersList.map(u => (
              <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                <td className="p-3 font-medium text-foreground">{u.full_name}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleColors[u.role] || 'bg-secondary text-foreground'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">{u.section || u.semesters?.name ? `${u.semesters?.name ? `Sem ${u.semesters.name} ` : ''}${u.section || ''}` : '—'}</td>
                <td className="p-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderUserGroup = (title: string, usersList: UserProfile[]) => {
    if (usersList.length === 0 && allUsersSearch) return null; // hide empty groups when searching
    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-foreground flex items-center justify-between bg-secondary/20 p-2 rounded-lg">
          {title}
          <span className="bg-secondary px-2 py-0.5 rounded-md text-xs">{usersList.length}</span>
        </h4>
        {renderUsersTable(usersList)}
      </div>
    );
  };

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

      {/* ========= ACADEMIC MANAGEMENT TAB ========= */}
      {activeTab === 'academic' && (
        <div className="space-y-6">
          {academicSuccess && <AlertBanner type="success" message={academicSuccess} onClose={() => setAcademicSuccess(null)} />}
          {academicError && <AlertBanner type="error" message={academicError} onClose={() => setAcademicError(null)} />}

          {/* Promote Students Section */}
          <div className="bg-card rounded-3xl p-8 shadow-sm border border-border relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-primary/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                  <ArrowUpCircle className="w-7 h-7 text-primary" />
                  Promote All Students
                </h2>
                <p className="text-muted-foreground mt-1">Advance all eligible students to the next semester across all departments.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleExportPreData} disabled={exportingPreData} className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-5 py-3 rounded-xl font-medium border border-border transition-all shadow-sm disabled:opacity-50">
                  <Download className="w-4 h-4" />
                  {exportingPreData ? 'Exporting...' : 'Download Current Data'}
                </button>
                <button onClick={() => setShowPromoteConfirm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-xl font-bold transition-all shadow-md hover:shadow-lg">
                  <ArrowUpCircle className="w-5 h-5" />
                  Promote All Students
                </button>
              </div>
            </div>

            {/* Current Distribution */}
            {academicLoading ? (
              <div className="p-6 text-center text-muted-foreground animate-pulse">Loading student distribution...</div>
            ) : Object.keys(promotionSummary).length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No active students found.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(promotionSummary).map(([dept, sems]) => (
                  <div key={dept} className="bg-background rounded-2xl p-5 border border-border">
                    <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" /> {dept}
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(sems).sort(([a], [b]) => {
                        const numA = parseInt(a) || 99;
                        const numB = parseInt(b) || 99;
                        return numA - numB;
                      }).map(([sem, count]) => {
                        const semNum = parseInt(sem);
                        const arrow = semNum === 8 ? '→ Graduated' : isNaN(semNum) ? '' : `→ Sem ${semNum + 1}`;
                        return (
                          <div key={sem} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Sem {sem} <span className="text-primary font-medium">{arrow}</span>
                            </span>
                            <span className="font-bold text-foreground bg-secondary px-2 py-0.5 rounded-lg">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Promotion Confirmation Modal */}
          {showPromoteConfirm && (
            <Modal title="Confirm Mass Promotion" icon={<ArrowUpCircle className="w-5 h-5 text-primary" />} onClose={() => setShowPromoteConfirm(false)}>
              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                    ⚠️ This action will promote ALL students across ALL departments to their next semester.
                  </p>
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>• Semesters 1→2, 2→3, ... 7→8</p>
                  <p>• <strong>8th Sem</strong> students will be moved to <strong>Graduated</strong></p>
                  <p>• <strong>2nd→3rd Sem</strong> students will have sections cleared for reassignment</p>
                  <p>• All old clearance data, enrollments, IA attendance will be cleared</p>
                </div>
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                  <p className="text-foreground text-sm font-medium">
                    💡 Tip: Use "Download Current Data" before promoting to backup all records.
                  </p>
                </div>
                <p className="text-foreground font-bold text-center">Are you sure you want to promote all eligible students?</p>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setShowPromoteConfirm(false)} className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all">Cancel</button>
                <button onClick={handlePromoteAll} disabled={promoting} className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all disabled:opacity-50">
                  {promoting ? 'Promoting...' : 'Yes, Promote All'}
                </button>
              </div>
            </Modal>
          )}

          {/* Promotion Result */}
          {promotionResult && (
            <div className="bg-card rounded-3xl p-6 shadow-sm border border-emerald-500/20">
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-500" /> Promotion Results
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-emerald-500/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-600">{promotionResult.total_promoted}</p>
                  <p className="text-sm text-muted-foreground">Promoted</p>
                </div>
                <div className="bg-blue-500/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600">{promotionResult.total_graduated}</p>
                  <p className="text-sm text-muted-foreground">Graduated</p>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-amber-600">{promotionResult.total_sections_cleared}</p>
                  <p className="text-sm text-muted-foreground">Sections Cleared (need reassignment)</p>
                </div>
              </div>
            </div>
          )}

          {/* Active Students Details Section */}
          <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                  <Users className="w-7 h-7 text-indigo-500" />
                  Students Details
                </h2>
                <p className="text-muted-foreground mt-1">{graduatedStudents.length} active students</p>
              </div>
              {graduatedStudents.length > 0 && (
                <div className="flex gap-3">
                  <button onClick={() => handleExportGraduatedCSV(graduatedStudents)} className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-5 py-3 rounded-xl font-medium border border-border transition-all">
                    <Download className="w-4 h-4" /> Download All CSV
                  </button>
                </div>
              )}
            </div>

            {Object.keys(graduatedByDeptBatch).length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No students found.</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(graduatedByDeptBatch).map(([dept, batches]) => {
                  const deptStudents = Object.values(batches).flat();
                  const isDeptExpanded = expandedGradDepts.has(dept);
                  return (
                    <div key={dept} className="bg-background rounded-2xl border border-border overflow-hidden">
                      <button onClick={() => { const next = new Set(expandedGradDepts); isDeptExpanded ? next.delete(dept) : next.add(dept); setExpandedGradDepts(next); }} className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors">
                        <div className="flex items-center gap-3">
                          {isDeptExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                          <div>
                            <h3 className="text-lg font-bold text-foreground">{dept}</h3>
                            <p className="text-sm text-muted-foreground">{deptStudents.length} students • {Object.keys(batches).length} semester(s)</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleExportGraduatedCSV(deptStudents); }} className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors" title="Download CSV"><Download className="w-4 h-4" /></button>
                        </div>
                      </button>
                      {isDeptExpanded && (
                        <div className="border-t border-border p-4 space-y-3">
                          {Object.entries(batches).sort(([a], [b]) => b.localeCompare(a)).map(([batch, students]) => {
                            const batchKey = `${dept}-${batch}`;
                            const isBatchExpanded = expandedGradBatches.has(batchKey);
                            return (
                              <div key={batch} className="bg-card rounded-xl border border-border overflow-hidden">
                                <button onClick={() => { const next = new Set(expandedGradBatches); isBatchExpanded ? next.delete(batchKey) : next.add(batchKey); setExpandedGradBatches(next); }} className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/20 transition-colors">
                                  <div className="flex items-center gap-2">
                                    {isBatchExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                    <span className="font-bold text-foreground">Semester {batch}</span>
                                    <span className="text-sm text-muted-foreground">({students.length} students)</span>
                                  </div>
                                </button>
                                {isBatchExpanded && (
                                  <div className="border-t border-border overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                      <thead><tr className="bg-secondary/30 text-foreground text-sm border-b border-border">
                                        <th className="p-3 font-semibold">Name</th>
                                        <th className="p-3 font-semibold">Roll Number</th>
                                        <th className="p-3 font-semibold">Enrolled</th>
                                      </tr></thead>
                                      <tbody className="divide-y divide-border">
                                        {students.map((s: any) => (
                                          <tr key={s.id} className="hover:bg-secondary/10 transition-colors">
                                            <td className="p-3 font-medium text-foreground">{s.full_name}</td>
                                            <td className="p-3 text-muted-foreground font-mono text-sm">{s.roll_number || '—'}</td>
                                            <td className="p-3 text-muted-foreground text-sm">{new Date(s.created_at).toLocaleDateString()}</td>
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
        </div>
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
                    <option value="fyc">First Year Coordinator (FYC)</option>
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
             <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <p className="text-foreground font-bold pl-2">Select a Department</p>
                 <button onClick={() => { setShowCreateSemester(true); setSemesterError(null); setSemesterSuccess(null); }} className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-3 rounded-xl font-bold transition-all shadow-sm">
                   <Plus className="w-5 h-5" />
                   Mass Create Semesters
                 </button>
               </div>
               {semesterSuccess && <AlertBanner type="success" message={semesterSuccess} onClose={() => setSemesterSuccess(null)} />}

               {/* Mass Create Semester Modal (no dept selected) */}
               {showCreateSemester && !selectedDeptSubjects && (
                 <Modal title="Mass Create Semesters — All Departments" icon={<Plus className="w-5 h-5 text-primary" />} onClose={() => setShowCreateSemester(false)}>
                   {semesterError && <div className="mb-4"><AlertBanner type="error" message={semesterError} onClose={() => setSemesterError(null)} /></div>}
                   <div className="space-y-4">
                     <FormField label="Semester Names (comma-separated)">
                       <input type="text" className="modal-input" placeholder="e.g. Semester 1, Semester 2, Semester 3" value={newSemesterName} onChange={e => setNewSemesterName(e.target.value)} />
                     </FormField>
                     <p className="text-sm text-muted-foreground italic">These semesters will be created in ALL {departments.length} departments. Duplicates are automatically skipped.</p>
                   </div>
                   <ModalActions onCancel={() => setShowCreateSemester(false)} onSubmit={() => handleAdminCreateSemester(true)} loading={semesterCreating} label={`Create in All ${departments.length} Departments`} />
                 </Modal>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {departments.map((dept) => (
                    <button key={dept.id} onClick={() => { setSelectedDeptSubjects(dept); fetchSemestersForDept(dept.id); }} className="bg-card p-6 rounded-3xl shadow-sm border border-border hover:border-primary/50 hover:shadow-md transition-all text-left group">
                       <Building2 className="w-8 h-8 text-primary mb-4" />
                       <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{dept.name}</h3>
                       <p className="text-muted-foreground mt-2">{subjects.filter(s => s.department_id === dept.id).length} subjects total</p>
                    </button>
                  ))}
               </div>
             </div>
          ) : !selectedSemSubjects ? (
             <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold text-foreground">Select a Semester for {selectedDeptSubjects.name}</h3>
                 <button onClick={() => { setShowCreateSemester(true); setSemesterError(null); setSemesterSuccess(null); }} className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-3 rounded-xl font-bold transition-all shadow-sm">
                   <Plus className="w-5 h-5" />
                   Add Semester
                 </button>
               </div>
               {semesterSuccess && <AlertBanner type="success" message={semesterSuccess} onClose={() => setSemesterSuccess(null)} />}

               {/* Create Semester Modal (dept selected) */}
               {showCreateSemester && (
                 <Modal title={`Add Semesters to ${selectedDeptSubjects.name}`} icon={<Plus className="w-5 h-5 text-primary" />} onClose={() => setShowCreateSemester(false)}>
                   {semesterError && <div className="mb-4"><AlertBanner type="error" message={semesterError} onClose={() => setSemesterError(null)} /></div>}
                   <div className="space-y-4">
                     <FormField label="Semester Names (comma-separated)">
                       <input type="text" className="modal-input" placeholder="e.g. Semester 1, Semester 2" value={newSemesterName} onChange={e => setNewSemesterName(e.target.value)} />
                     </FormField>
                     <p className="text-sm text-muted-foreground italic">Separate multiple names with commas. Duplicates are automatically skipped.</p>
                   </div>
                   <div className="flex gap-3 mt-8">
                     <button onClick={() => setShowCreateSemester(false)} className="flex-1 py-3 px-4 rounded-xl border border-border font-medium hover:bg-secondary">Cancel</button>
                     <button onClick={() => handleAdminCreateSemester(false)} disabled={semesterCreating} className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-50">
                       {semesterCreating ? 'Creating...' : `Create for ${selectedDeptSubjects.name}`}
                     </button>
                     <button onClick={() => handleAdminCreateSemester(true)} disabled={semesterCreating} className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 disabled:opacity-50">
                       {semesterCreating ? 'Creating...' : `Create in All Depts`}
                     </button>
                   </div>
                 </Modal>
               )}

               {semestersList.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground bg-card rounded-3xl border border-border">No semesters found in this department. Click "Add Semester" to create one.</div>
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
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Eye className="w-6 h-6 text-primary" />
              Users Overview
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative flex-1 w-full md:w-64">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Search users..." className="pl-10 pr-4 py-2 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary w-full text-sm" value={allUsersSearch} onChange={e => setAllUsersSearch(e.target.value)} />
              </div>
            </div>
          </div>

          {allUsersLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse bg-card rounded-3xl border border-border">Loading users hierarchy...</div>
          ) : (
            <div className="space-y-4">
              {/* GLOBAL USERS */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <button onClick={() => { const next = new Set(expandedAllUsersSections); expandedAllUsersSections.has('global') ? next.delete('global') : next.add('global'); setExpandedAllUsersSections(next); }} className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {expandedAllUsersSections.has('global') ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                    <ShieldCheck className="w-6 h-6 text-amber-500" />
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Global Users</h3>
                      <p className="text-sm text-muted-foreground">Accounts, Librarian, Admin, COE, Principal</p>
                    </div>
                  </div>
                </button>
                {expandedAllUsersSections.has('global') && (
                  <div className="border-t border-border p-4 bg-background/50">
                     {renderUsersTable(filteredAllUsers.filter(u => ['admin', 'principal', 'coe', 'accounts', 'librarian'].includes(u.role) || (!u.department_id && u.role !== 'student')))}
                  </div>
                )}
              </div>

              {/* VIRTUAL First Year Dept */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <button onClick={() => { const next = new Set(expandedAllUsersSections); expandedAllUsersSections.has('fy') ? next.delete('fy') : next.add('fy'); setExpandedAllUsersSections(next); }} className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {expandedAllUsersSections.has('fy') ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                    <Building2 className="w-6 h-6 text-indigo-500" />
                    <div>
                      <h3 className="text-lg font-bold text-foreground">First Year Department</h3>
                      <p className="text-sm text-muted-foreground">FYC, Clerk, Sem 1 & 2 Students, Teachers</p>
                    </div>
                  </div>
                </button>
                {expandedAllUsersSections.has('fy') && (
                  <div className="border-t border-border p-4 bg-background/50 space-y-4">
                    {renderUserGroup("First Year Coordinator (FYC)", filteredAllUsers.filter(u => u.role === 'fyc'))}
                    {renderUserGroup("Clerks", filteredAllUsers.filter(u => u.role === 'clerk'))}
                    {renderUserGroup("Teachers (Created by FYC/Clerk)", filteredAllUsers.filter(u => ['faculty', 'teacher'].includes(u.role) && ['fyc', 'clerk'].includes(teacherCreatorRoles[u.id] || '')))}
                    {renderUserGroup("Students (Semesters 1 & 2)", filteredAllUsers.filter(u => u.role === 'student' && ['1', '2'].includes(u.semesters?.name || '')))}
                  </div>
                )}
              </div>

              {/* Other Departments */}
              {departments.map(dept => {
                 return (
                   <div key={dept.id} className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                     <button onClick={() => { const next = new Set(expandedAllUsersSections); expandedAllUsersSections.has(dept.id) ? next.delete(dept.id) : next.add(dept.id); setExpandedAllUsersSections(next); }} className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors">
                       <div className="flex items-center gap-3">
                         {expandedAllUsersSections.has(dept.id) ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                         <Building2 className="w-6 h-6 text-primary" />
                         <div>
                           <h3 className="text-lg font-bold text-foreground">{dept.name}</h3>
                           <p className="text-sm text-muted-foreground">HOD, Staff, Sem 3-8 Students, Teachers</p>
                         </div>
                       </div>
                     </button>
                     {expandedAllUsersSections.has(dept.id) && (
                       <div className="border-t border-border p-4 bg-background/50 space-y-4">
                         {renderUserGroup("HOD (Head of Department)", filteredAllUsers.filter(u => u.department_id === dept.id && u.role === 'hod'))}
                         {renderUserGroup("Staff", filteredAllUsers.filter(u => u.department_id === dept.id && u.role === 'staff'))}
                         {renderUserGroup("Teachers (Created by HOD/Staff)", filteredAllUsers.filter(u => u.department_id === dept.id && ['faculty', 'teacher'].includes(u.role) && ['hod', 'staff'].includes(teacherCreatorRoles[u.id] || '')))}
                         {renderUserGroup("Other Teachers", filteredAllUsers.filter(u => u.department_id === dept.id && ['faculty', 'teacher'].includes(u.role) && !['hod', 'staff', 'fyc', 'clerk'].includes(teacherCreatorRoles[u.id] || '')))}
                         {renderUserGroup("Students (Semesters 3 to 8)", filteredAllUsers.filter(u => u.department_id === dept.id && u.role === 'student' && !['1', '2'].includes(u.semesters?.name || '')))}
                       </div>
                     )}
                   </div>
                 );
              })}
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

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="bg-card rounded-3xl p-8 shadow-sm border border-border animate-fade-in space-y-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">System Activity Logs</h2>
              <p className="text-muted-foreground mt-1">Monitoring COE, Librarian, HOD and Accounts activity.</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 mb-6 relative z-10">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-1.5">Department Filter</label>
              <select 
                value={logsDeptFilter} 
                onChange={(e) => {
                   setLogsDeptFilter(e.target.value);
                   setLogsRoleFilter('all');
                   setLogsUserFilter('all');
                }}
                className="w-full p-3 bg-background border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="all">All Departments / Global</option>
                <option value="accounts">Accounts</option>
                <option value="coe">COE</option>
                <option value="library">Library</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-1.5">Role Filter</label>
              <select 
                value={logsRoleFilter} 
                onChange={(e) => {
                  setLogsRoleFilter(e.target.value);
                  setLogsUserFilter('all');
                }}
                className="w-full p-3 bg-background border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50"
                disabled={['accounts', 'coe', 'library'].includes(logsDeptFilter) && logsDeptFilter !== 'all'}
              >
                <option value="all">All Roles</option>
                <option value="coe">COE</option>
                <option value="librarian">Librarian</option>
                <option value="hod">HODs</option>
                <option value="accounts">Accounts</option>
              </select>
              {['accounts', 'coe', 'library'].includes(logsDeptFilter) && logsDeptFilter !== 'all' && (
                <p className="text-xs text-muted-foreground mt-1">Role is implicitly set by department.</p>
              )}
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-1.5">Search User</label>
              <select 
                value={logsUserFilter} 
                onChange={(e) => setLogsUserFilter(e.target.value)}
                className="w-full p-3 bg-background border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50"
                disabled={logsUsersList.length === 0}
              >
                <option value="all">All Users in Subset</option>
                {logsUsersList.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border border-border rounded-2xl overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/40 text-foreground text-sm border-b border-border">
                  <th className="p-5 font-semibold">Date & Time</th>
                  <th className="p-5 font-semibold">User Role</th>
                  <th className="p-5 font-semibold">User Name</th>
                  <th className="p-5 font-semibold">Action Type</th>
                  <th className="p-5 font-semibold w-1/2">Detailed Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {logsLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground animate-pulse">Loading secure audit logs...</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No logs found matching your filters.</td></tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="p-5 text-sm whitespace-nowrap text-muted-foreground font-medium">
                        {new Date(log.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="p-5">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleColors[log.user_role] || 'bg-secondary text-foreground'}`}>
                          {log.user_role}
                        </span>
                      </td>
                      <td className="p-5 font-bold text-foreground">{log.user_name}</td>
                      <td className="p-5 text-sm font-medium text-primary">{log.action}</td>
                      <td className="p-5 text-sm text-foreground">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
