import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import {
  getHodPendingRequests, approveHodRequest, getUsersByDeptAndRoles,
  getDepartmentById, getHodDepartmentStudents, getHodFinePayments,
  isFirstYearSem
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import StudentDuesOverviewTab from './shared/StudentDuesOverviewTab';
import AttendanceFinesTab from './shared/AttendanceFinesTab';

import {
  CheckCircle2, UserCog, Search, Users, Activity, X, Import,
  Trash2, UserPlus, Download, User, ChevronDown, ChevronRight, FileCheck,
  GraduationCap, BookOpen, Eye, Clock, Banknote, FileWarning
} from 'lucide-react';
import { logAndFormatError } from '../../lib/errorHandler';

type ClearanceRequest = {
  id: string;
  student_id: string;
  current_stage: string;
  status: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string } | null;
};

type ClearanceInfo = { status: string, current_stage: string, created_at: string, updated_at: string };

type UserProfile = {
  id: string;
  full_name: string;
  role: string;
  department_id: string | null;
  section: string | null;
  roll_number?: string | null;
  created_at: string;
  created_by?: string | null;
  semesters?: { name: string } | null;
  clearance_requests?: ClearanceInfo[] | ClearanceInfo | null;
};

// Helper: Supabase returns a single object (not array) when the FK is UNIQUE
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

type TabType = 'approvals' | 'users' | 'students' | 'fineApprovals' | 'collegeDues' | 'teacherDetails' | 'activityLogs' | 'studentdues' | 'attendances';

export default function HodDashboard() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('approvals');
  const [deptName, setDeptName] = useState<string>('');

  // Approvals state
  const [requests, setRequests] = useState<ClearanceRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [searchReqs, setSearchReqs] = useState('');

  // Users state
  const [departmentUsers, setDepartmentUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'staff' });
  const [userCreating, setUserCreating] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Import Teachers state
  const [importableTeachers, setImportableTeachers] = useState<any[]>([]);
  const [loadingImportTeachers, setLoadingImportTeachers] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importingTeachers, setImportingTeachers] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importedTeachers, setImportedTeachers] = useState<any[]>([]);
  const [importDeptFilter, setImportDeptFilter] = useState<string>('');
  const [allDepartments, setAllDepartments] = useState<any[]>([]);

  // Students state
  const [departmentStudents, setDepartmentStudents] = useState<UserProfile[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());
  const [searchStudents, setSearchStudents] = useState('');

  // Fine Payments state
  const [approvedFines, setApprovedFines] = useState<any[]>([]);
  const [loadingFines, setLoadingFines] = useState(false);
  const [searchFines, setSearchFines] = useState('');

  // College Dues state
  const [collegeDues, setCollegeDues] = useState<any[]>([]);
  const [loadingCollegeDues, setLoadingCollegeDues] = useState(false);
  const [searchCollegeDues, setSearchCollegeDues] = useState('');

  // Teacher Details state
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherWithAssignments[]>([]);
  const [loadingTeacherDetails, setLoadingTeacherDetails] = useState(false);
  const [searchTeachers, setSearchTeachers] = useState('');
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());

  // Activity Logs state
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchLogs, setSearchLogs] = useState('');

  useEffect(() => {
    if (user && profile?.department_id) {
      fetchDeptName();
      if (activeTab === 'approvals') fetchRequests();
      if (activeTab === 'users') fetchUsers();
      if (activeTab === 'students') fetchStudents();
      if (activeTab === 'fineApprovals') fetchApprovedFines();
      if (activeTab === 'collegeDues') fetchCollegeDues();
      if (activeTab === 'teacherDetails') fetchTeacherDetails();
      if (activeTab === 'activityLogs') fetchActivityLogs();
    }
  }, [user, activeTab, profile?.department_id]);

  // FIX #21: Replace Realtime WebSocket with interval polling (30s)
  useEffect(() => {
    if (user) {
      const interval = setInterval(() => {
        if (activeTab === 'approvals') fetchRequests();
      }, 30_000);
      return () => { clearInterval(interval); }
    }
  }, [user, activeTab]);

  const fetchDeptName = async () => {
    if (!profile?.department_id) return;
    try {
      const dept = await getDepartmentById(profile.department_id);
      setDeptName(dept?.name || profile.department_id);
    } catch { setDeptName(profile.department_id); }
  };

  const fetchRequests = async () => {
    if (!profile?.department_id) return;
    setLoadingReqs(true);
    try {
      const data = await getHodPendingRequests(profile.department_id);
      const filtered = (data as any[]).filter(r => !isFirstYearSem(r.profiles?.semesters?.name || ''));
      setRequests(filtered as unknown as ClearanceRequest[]);
    } catch (err) { console.error(err); }
    finally { setLoadingReqs(false); }
  };

  const fetchStudents = async () => {
    if (!profile?.department_id) return;
    setLoadingStudents(true);
    try {
      const data = await getHodDepartmentStudents(profile.department_id);
      const filtered = (data as any[]).filter(s => !isFirstYearSem(s.semesters?.name || ''));
      setDepartmentStudents(filtered as unknown as UserProfile[]);
    } catch (err) { console.error(err); }
    finally { setLoadingStudents(false); }
  };

  const fetchUsers = async () => {
    if (!profile?.department_id) return;
    setLoadingUsers(true);
    try {
      const data = await getUsersByDeptAndRoles(profile.department_id, ['staff', 'teacher', 'faculty']);
      // Exclude FYC-managed teachers (created_by is set by FYC)
      const filtered = (data as UserProfile[]).filter(u => !(u).created_by);
      setDepartmentUsers(filtered);

      const importedData = await import('../../lib/api').then(m => m.getImportedTeachersForDept(profile.department_id!));
      setImportedTeachers(importedData);
    } catch (err) { console.error(err); }
    finally { setLoadingUsers(false); }
  };

  const fetchImportableTeachersList = async () => {
    if (!profile?.department_id) return;
    setLoadingImportTeachers(true);
    setImportError(null);
    try {
      const [teacherData, deptData] = await Promise.all([
        import('../../lib/api').then(m => m.getImportableTeachers(profile.department_id!)),
        import('../../lib/api').then(m => m.getAllDepartments())
      ]);
      setImportableTeachers(teacherData);
      // Exclude current department from dropdown
      setAllDepartments((deptData || []).filter((d: any) => d.id !== profile.department_id));
    } catch (err) { console.error(err); }
    finally { setLoadingImportTeachers(false); }
  };

  const handleImportSelectedTeachers = async () => {
    if (!profile?.department_id) return;
    if (selectedImportIds.size === 0) { setImportError('Select at least one teacher'); return; }
    setImportingTeachers(true);
    try {
      await import('../../lib/api').then(m => m.importTeachersToDept(profile.department_id!, Array.from(selectedImportIds), user!.id));
      setImportSuccess('Teachers imported successfully');
      setSelectedImportIds(new Set());
      fetchUsers();
      setShowImportModal(false);
    } catch (err: any) {
      setImportError(await logAndFormatError(err, { dashboard_name: 'HodDashboard' }));
    } finally {
      setImportingTeachers(false);
    }
  };

  const handleRemoveImport = async (teacherId: string) => {
    if (!profile?.department_id) return;
    if (!confirm('Are you sure you want to remove this imported teacher?')) return;
    try {
      await import('../../lib/api').then(m => m.removeImportedTeacher(profile.department_id!, teacherId));
      fetchUsers();
    } catch (err: any) {
      alert(await logAndFormatError(err, { dashboard_name: 'HodDashboard' }));
    }
  };

  const fetchApprovedFines = async () => {
    if (!profile?.department_id) return;
    setLoadingFines(true);
    try {
      const data = await getHodFinePayments(profile.department_id);
      const filtered = (data || []).filter((f: any) => !isFirstYearSem(f.profiles?.semesters?.name || ''));
      setApprovedFines(filtered);
    } catch (err) { console.error(err); }
    finally { setLoadingFines(false); }
  };

  const fetchCollegeDues = async () => {
    if (!profile?.department_id) return;
    setLoadingCollegeDues(true);
    try {
      const data = await import('../../lib/api').then(m => m.getStaffStudentDues(profile.department_id!));
      const filtered = (data || []).filter((d: any) => !isFirstYearSem(d.profiles?.semesters?.name || ''));
      setCollegeDues(filtered);
    } catch (err) { console.error(err); }
    finally { setLoadingCollegeDues(false); }
  };

  const fetchTeacherDetails = async () => {
    if (!profile?.department_id) return;
    setLoadingTeacherDetails(true);
    try {
      const data = await import('../../lib/api').then(m => m.getHodTeacherAssignments(profile.department_id!));
      setTeacherAssignments(data as TeacherWithAssignments[]);
    } catch (err) { console.error(err); }
    finally { setLoadingTeacherDetails(false); }
  };

  const fetchActivityLogs = async () => {
    if (!profile?.department_id) return;
    setLoadingLogs(true);
    try {
      const data = await import('../../lib/api').then(m => m.getHodStaffActivityLogs(profile.department_id!));
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
          message: 'HOD has approved your final clearance. You can now view your No Due Clearance Report.',
          type: 'success'
        }]);
      }
      fetchRequests();
    } catch (err: any) {
      alert("Failed to approve request: " + await logAndFormatError(err, { dashboard_name: 'HodDashboard' }));
    }
  };

  const handleManualFeeUpdate = async (dueId: string, _fineAmount: number, _paidAmount: number = 0, profileName: string = 'Student') => {
    try {
      // Directly mark as completed (cleared)
      const { error } = await supabase
        .from('student_dues')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', dueId);
      if (error) throw error;
      
      setCollegeDues(prev => prev.map(d => {
        if (d.id === dueId) {
          return { ...d, status: 'completed' };
        }
        return d;
      }));
      alert(`Dues cleared for ${profileName}.`);
    } catch (err: any) {
      alert('Failed to clear dues: ' + (err?.message || 'Unknown'));
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
          message: 'HOD has approved your final clearance. You can now view your No Due Clearance Report.',
          type: 'success'
        }]);
      }
      fetchRequests();
    } catch (err: any) {
      alert("Error during bulk approval: " + await logAndFormatError(err, { dashboard_name: 'HodDashboard' }));
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

    try {
      const { createUserSecure } = await import('../../lib/supabase');

      await createUserSecure({
        email: newUser.email,
        password: newUser.password,
        full_name: newUser.full_name,
        role: newUser.role,
        department_id: profile.department_id,
      });

      setUserSuccess(`${newUser.role === 'staff' ? 'Staff' : 'Teacher'} "${newUser.full_name}" created!`);
      setNewUser({ email: '', password: '', full_name: '', role: 'staff' });
      setShowCreateUser(false);
      fetchUsers();
    } catch (err: any) {
      setUserError(await logAndFormatError(err, { dashboard_name: 'HodDashboard' }));
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
      setUserError(await logAndFormatError(err, { dashboard_name: 'HodDashboard' }));
    }
  };

  const handleExportStudentsCSV = () => {
    if (departmentStudents.length === 0) {
      alert("No students to export.");
      return;
    }
    const header = "Name,Roll Number,Semester,Section,Clearance Status,Current Stage\n";
    const rows = departmentStudents.map(student => {
      const req = getClearanceReq(student);
      const status = req ? req.status : 'Not Applied';
      const stage = req ? req.current_stage : 'N/A';
      const sem = student.semesters?.name || 'N/A';
      return `"${student.full_name}","${(student).roll_number || 'N/A'}","${sem}","${student.section || 'N/A'}","${status}","${stage}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dept_students_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportClearanceCSV = () => {
    const studentsWithClearance = departmentStudents.filter(s => getClearanceReq(s) !== null);
    if (studentsWithClearance.length === 0) {
      alert("No clearance data to export.");
      return;
    }
    const header = "Name,Roll Number,Semester,Section,Clearance Status,Current Stage,Applied Date,Last Updated\n";
    const rows = studentsWithClearance.map(student => {
      const req = getClearanceReq(student)!;
      const sem = student.semesters?.name || 'N/A';
      const appliedDate = req.created_at ? new Date(req.created_at).toLocaleDateString() : 'N/A';
      const updatedDate = req.updated_at ? new Date(req.updated_at).toLocaleDateString() : 'N/A';
      return `"${student.full_name}","${(student).roll_number || 'N/A'}","${sem}","${student.section || 'N/A'}","${req.status}","${req.current_stage}","${appliedDate}","${updatedDate}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dept_clearance_details.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'approvals', label: 'Clearances', icon: <Activity className="w-4 h-4" /> },
    { id: 'fineApprovals', label: 'Fine Payments', icon: <FileCheck className="w-4 h-4" /> },
    { id: 'collegeDues', label: 'College Dues', icon: <Banknote className="w-4 h-4" /> },
    { id: 'studentdues', label: 'Student Dues Overview', icon: <Eye className="w-4 h-4" /> },
    { id: 'attendances', label: 'Attendance Fines', icon: <FileWarning className="w-4 h-4 text-destructive" /> },
    { id: 'users', label: 'Staff & Teachers', icon: <Users className="w-4 h-4" /> },
    { id: 'teacherDetails', label: 'Teacher Details', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'students', label: 'Students', icon: <User className="w-4 h-4" /> },
    { id: 'activityLogs', label: 'Activity Logs', icon: <Clock className="w-4 h-4" /> }
  ];

  const toggleSem = (semName: string) => {
    const next = new Set(expandedSems);
    if (next.has(semName)) next.delete(semName);
    else next.add(semName);
    setExpandedSems(next);
  };

  const toggleTeacher = (teacherId: string) => {
    const next = new Set(expandedTeachers);
    if (next.has(teacherId)) next.delete(teacherId);
    else next.add(teacherId);
    setExpandedTeachers(next);
  };

  // Filter teachers by search
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
    a.href = url;
    a.download = 'teacher_details_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter students by search
  const filteredStudents = departmentStudents.filter(s =>
    s.full_name?.toLowerCase().includes(searchStudents.toLowerCase()) ||
    (s).roll_number?.toLowerCase().includes(searchStudents.toLowerCase()) ||
    s.section?.toLowerCase().includes(searchStudents.toLowerCase())
  );

  // Group filtered students by semester then section
  const studentsBySem = filteredStudents.reduce((acc, student) => {
    const sem = student.semesters?.name || 'Unassigned Semester';
    if (!acc[sem]) acc[sem] = {};
    const sec = student.section || 'Unassigned Section';
    if (!acc[sem][sec]) acc[sem][sec] = [];
    acc[sem][sec].push(student);
    return acc;
  }, {} as Record<string, Record<string, UserProfile[]>>);

  const filteredReqs = requests.filter(r => r.profiles?.full_name?.toLowerCase().includes(searchReqs.toLowerCase()));
  const filteredUsers = departmentUsers.filter(u => u.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) || u.role?.toLowerCase().includes(searchUsers.toLowerCase()));

  const roleColors: Record<string, string> = {
    staff: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    teacher: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    faculty: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  };

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
            <UserCog className="w-8 h-8 mr-3 text-emerald-500" />
            HOD â€” {deptName}
          </h1>
          <p className="text-muted-foreground">Manage clearances, staff, teachers, and subjects.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border flex flex-wrap gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-emerald-500 text-white shadow-md'
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
                className="pl-10 pr-4 py-3 bg-secondary border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full md:w-80"
                value={searchReqs}
                onChange={e => setSearchReqs(e.target.value)}
              />
            </div>
            <button
              onClick={handleBulkApprove}
              disabled={filteredReqs.length === 0}
              className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-6 py-3 rounded-xl font-bold disabled:opacity-50 transition-all shadow-sm"
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
                  <CheckCircle2 className="w-10 h-10 text-emerald-500/50" />
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
                      <th className="p-4 font-semibold">Arrival Date</th>
                      <th className="p-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredReqs.map(req => (
                      <tr key={req.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-bold text-foreground">{req.profiles?.full_name || 'Unknown'}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {new Date(req.updated_at).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleApprove(req.id)}
                            className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-colors font-medium border border-emerald-500/20 hover:border-emerald-500"
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
              <span>âœ“ {userSuccess}</span>
              <button onClick={() => setUserSuccess(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="relative flex-1 w-full md:max-w-xs">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search staff/teachers..."
                className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
                value={searchUsers}
                onChange={e => setSearchUsers(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowImportModal(true); fetchImportableTeachersList(); }}
                className="flex items-center gap-2 bg-blue-500 text-white hover:bg-blue-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm"
              >
                <Import className="w-5 h-5" />
                Import Teachers
              </button>
              <button
                onClick={() => setShowCreateUser(true)}
                className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm"
              >
                <UserPlus className="w-5 h-5" />
                Add Staff / Teacher
              </button>
            </div>
          </div>

          {/* Import Teachers Modal */}
          {showImportModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-2xl mt-10 mb-10">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Import className="w-5 h-5 text-blue-500" />
                    Import Teachers from Other Departments
                  </h3>
                  <button onClick={() => { setShowImportModal(false); setSelectedImportIds(new Set()); setImportDeptFilter(''); }} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                {importError && (
                  <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
                    <span><strong>Error:</strong> {importError}</span>
                    <button onClick={() => setImportError(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}
                {importSuccess && (
                  <div className="p-4 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 text-sm flex justify-between items-center">
                    <span><strong>Success:</strong> {importSuccess}</span>
                    <button onClick={() => setImportSuccess(null)}><X className="w-4 h-4" /></button>
                  </div>
                )}

                {/* Branch Dropdown */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Select Branch</label>
                  <select
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={importDeptFilter}
                    onChange={e => { setImportDeptFilter(e.target.value); setSelectedImportIds(new Set()); }}
                  >
                    <option value="">Choose a branch...</option>
                    <option value="__fyc__">First Year Teachers</option>
                    {allDepartments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {importDeptFilter && (() => {
                  const filtered = importableTeachers.filter(t => {
                    if (importDeptFilter === '__fyc__') return !!t.created_by;
                    // Show teachers native to this dept, but exclude those imported INTO this dept from elsewhere
                    if (t.department_id !== importDeptFilter) return false;
                    // Also exclude teachers that are already imported into this dept by someone else
                    if (t._importedIntoDepts && t._importedIntoDepts.includes(importDeptFilter)) return false;
                    return true;
                  });
                  return (
                    <div className="border border-border rounded-2xl overflow-hidden mt-4">
                      {loadingImportTeachers ? (
                        <div className="p-8 text-center text-muted-foreground animate-pulse">Loading teachers...</div>
                      ) : filtered.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">No teachers found in this branch.</div>
                      ) : (
                        <>
                          <div className="bg-secondary/50 px-4 py-3 border-b border-border flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500"
                                checked={filtered.length > 0 && filtered.every(t => selectedImportIds.has(t.id))}
                                onChange={() => {
                                  const allSelected = filtered.every(t => selectedImportIds.has(t.id));
                                  const next = new Set(selectedImportIds);
                                  if (allSelected) {
                                    filtered.forEach(t => next.delete(t.id));
                                  } else {
                                    filtered.forEach(t => next.add(t.id));
                                  }
                                  setSelectedImportIds(next);
                                }}
                              />
                              Select All ({filtered.length} teachers)
                            </label>
                            <span className="text-xs text-muted-foreground">{selectedImportIds.size} selected</span>
                          </div>
                          <div className="max-h-[40vh] overflow-y-auto">
                            {filtered.map(teacher => {
                              const isFYC = !!teacher.created_by;
                              return (
                                <label key={teacher.id} className="flex items-center gap-4 p-4 border-b border-border last:border-b-0 cursor-pointer hover:bg-secondary/30 transition-colors">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500"
                                    checked={selectedImportIds.has(teacher.id)}
                                    onChange={() => {
                                      const next = new Set(selectedImportIds);
                                      if (next.has(teacher.id)) next.delete(teacher.id);
                                      else next.add(teacher.id);
                                      setSelectedImportIds(next);
                                    }}
                                  />
                                  <div className="flex-1">
                                    <div className="font-bold text-foreground text-sm flex items-center gap-2">
                                      {teacher.full_name}
                                      {isFYC ? (
                                        <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 text-[10px] uppercase">FYC Teacher</span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] uppercase">{teacher.departments?.name || 'Unknown'}</span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{teacher.email}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="flex gap-3 mt-8">
                  <button onClick={() => setShowImportModal(false)} className="flex-1 py-3 px-4 rounded-xl border border-border font-medium hover:bg-secondary">Cancel</button>
                  <button onClick={handleImportSelectedTeachers} disabled={importingTeachers || selectedImportIds.size === 0} className="flex-1 py-3 px-4 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 disabled:opacity-50">
                    {importingTeachers ? 'Importing...' : `Import ${selectedImportIds.size} Teachers`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create User Modal */}
          {showCreateUser && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-lg">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-emerald-500" />
                    Add Staff / Teacher
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

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                    <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                    <input type="email" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value.trim() })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Role</label>
                    <select
                      className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={newUser.role}
                      onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="staff">Staff</option>
                      <option value="teacher">Teacher</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                    <input type="password" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-4 italic">User will be assigned to <strong>{deptName}</strong> department.</p>
                </div>

                <div className="flex gap-3 mt-8">
                  <button onClick={() => setShowCreateUser(false)} className="flex-1 py-3 px-4 rounded-xl border border-border font-medium hover:bg-secondary">Cancel</button>
                  <button onClick={handleCreateUser} disabled={userCreating} className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 disabled:opacity-50">
                    {userCreating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Users Table */}
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingUsers ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading department users...</div>
            ) : filteredUsers.length === 0 && importedTeachers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No staff or teachers found in your department.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">Role</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-4 font-medium text-foreground">{u.full_name}</td>
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
                    {importedTeachers.map((imp) => {
                      const t = imp.profiles;
                      const isVisible = t?.full_name?.toLowerCase().includes(searchUsers.toLowerCase()) || t?.role?.toLowerCase().includes(searchUsers.toLowerCase());
                      if (!t || !isVisible) return null;
                      return (
                        <tr key={imp.teacher_id} className="hover:bg-blue-500/5 transition-colors bg-blue-500/5">
                          <td className="p-4 font-medium text-foreground flex items-center gap-2">
                            {t.full_name}
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] uppercase font-bold tracking-wider">
                              Imported from {t.departments?.name || 'FYC'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${roleColors[t.role] || 'bg-secondary text-foreground'}`}>
                              {t.role}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button onClick={() => handleRemoveImport(imp.teacher_id)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors" title="Remove imported teacher">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
              <h2 className="text-xl font-bold text-foreground">Department Students Overview</h2>
              <p className="text-muted-foreground text-sm">View students by semester and section.</p>
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
                 className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
               >
                 <Download className="w-5 h-5" />
                 Export to CSV
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:max-w-sm">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, roll number, or section..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
              value={searchStudents}
              onChange={e => setSearchStudents(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            {loadingStudents ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse bg-card rounded-3xl shadow-sm border border-border">Loading students...</div>
            ) : departmentStudents.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground bg-card rounded-3xl shadow-sm border border-border">No students found in your department.</div>
            ) : (
              Object.entries(studentsBySem).map(([sem, sections]) => {
                const totalInSem = Object.values(sections).reduce((acc, s) => acc + s.length, 0);
                const isExpanded = expandedSems.has(sem);
                return (
                  <div key={sem} className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                    <button
                      onClick={() => toggleSem(sem)}
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{sem}</h3>
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
                                         <td className="p-3 text-muted-foreground text-sm font-mono">{(s).roll_number || 'â€”'}</td>
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
                                         <td className="p-3 text-xs font-medium text-muted-foreground">{req ? req.current_stage : 'â€”'}</td>
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

      {/* ========= FINE PAYMENTS TAB ========= */}
      {activeTab === 'fineApprovals' && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-1">
              <FileCheck className="w-5 h-5 text-emerald-500" />
              Attendance Fine Payments
            </h2>
            <p className="text-muted-foreground text-sm">
              Track all student attendance fines â€” pending, paid, and verified.
            </p>
          </div>

          {/* Summary Stats */}
          {!loadingFines && approvedFines.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[{
                label: 'Total Students',
                value: approvedFines.length,
                color: 'bg-blue-500/10 text-blue-600'
              }, {
                label: 'Total Fines',
                value: `\u20b9${approvedFines.reduce((s: number, i: any) => s + (Number(i.attendance_fee) || 0), 0)}`,
                color: 'bg-amber-500/10 text-amber-600'
              }, {
                label: 'Paid',
                value: approvedFines.filter((i: any) => i.attendance_fee_verified).length,
                color: 'bg-emerald-500/10 text-emerald-600'
              }, {
                label: 'Pending',
                value: approvedFines.filter((i: any) => !i.attendance_fee_verified && i.attendance_fee > 0).length,
                color: 'bg-red-500/10 text-red-600'
              }].map((stat, idx) => (
                <div key={idx} className={`${stat.color} rounded-2xl p-4 text-center`}>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs font-medium mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="relative w-full md:max-w-xs">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by student, subject, or USN..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
              value={searchFines}
              onChange={e => setSearchFines(e.target.value)}
            />
          </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingFines ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading fine payments...</div>
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
                    <FileCheck className="w-10 h-10 text-emerald-500/50" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">No Fine Records</h3>
                  <p className="text-muted-foreground mt-2">No attendance fines recorded for this department.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                        <th className="p-4 font-semibold">Student Name</th>
                        <th className="p-4 font-semibold">Roll No</th>
                        <th className="p-4 font-semibold">Subject</th>
                        <th className="p-4 font-semibold text-center">Attendance %</th>
                        <th className="p-4 font-semibold text-center">Fine (\u20b9)</th>
                        <th className="p-4 font-semibold text-center">Status</th>
                        <th className="p-4 font-semibold">Transaction ID</th>
                        <th className="p-4 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(item => (
                        <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-4 font-medium text-foreground">{item.profiles?.full_name}</td>
                          <td className="p-4 text-muted-foreground font-mono text-sm">{item.profiles?.roll_number || '\u2014'}</td>
                          <td className="p-4">
                            <div className="text-sm font-medium">{item.subjects?.subject_name}</div>
                            <div className="text-xs text-muted-foreground">{item.subjects?.subject_code}</div>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-amber-600 dark:text-amber-400 font-bold">{item.attendance_pct}%</span>
                          </td>
                          <td className="p-4 text-center font-bold text-foreground">
                            {item.attendance_fee ? `\u20b9${item.attendance_fee}` : '\u2014'}
                          </td>
                          <td className="p-4 text-center">
                            {item.attendance_fee_verified ? (
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">Paid</span>
                            ) : item.attendance_fee > 0 ? (
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600">Pending</span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-secondary text-muted-foreground">No Fine</span>
                            )}
                          </td>
                          <td className="p-4 text-xs font-mono text-muted-foreground max-w-[120px] truncate" title={item.razorpay_payment_id || ''}>
                            {item.razorpay_payment_id || '\u2014'}
                          </td>
                          <td className="p-4 text-xs text-muted-foreground whitespace-nowrap">
                            {item.payment_date ? new Date(item.payment_date).toLocaleDateString() : '\u2014'}
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

      {/* ========= COLLEGE DUES TAB ========= */}
      {activeTab === 'collegeDues' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-500" />
                College Fee Dues
              </h2>
              <p className="text-muted-foreground text-sm">Permit or clear pending college fees for your department's students.</p>
            </div>
          </div>

          <div className="relative w-full md:max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or roll number..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
              value={searchCollegeDues}
              onChange={e => setSearchCollegeDues(e.target.value)}
            />
          </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {(() => {
              const filtered = collegeDues.filter(d => 
                d.profiles?.full_name?.toLowerCase().includes(searchCollegeDues.toLowerCase()) || 
                d.profiles?.roll_number?.toLowerCase().includes(searchCollegeDues.toLowerCase())
              );

              return loadingCollegeDues ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse">Loading college dues...</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                    <Banknote className="w-10 h-10 text-emerald-500/50" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">No Records</h3>
                  <p className="text-muted-foreground mt-2">No pending college fees found for this department.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                        <th className="p-4 font-semibold">Student Name</th>
                        <th className="p-4 font-semibold">Roll No</th>
                        <th className="p-4 font-semibold">Semester / Sec</th>
                        <th className="p-4 font-semibold text-center">Status</th>
                        <th className="p-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(d => {
                        const isPermitted = d.status === 'pending' && d.permitted_until && new Date(d.permitted_until) > new Date();
                        return (
                          <tr key={d.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="p-4 font-medium text-foreground">{d.profiles?.full_name}</td>
                            <td className="p-4 text-muted-foreground font-mono text-sm">{d.profiles?.roll_number || '\u2014'}</td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {d.profiles?.semesters?.name || '\u2014'} / {d.profiles?.section || '\u2014'}
                            </td>
                            <td className="p-4 text-center">
                              {isPermitted ? (
                                <span className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                  PERMITTED
                                </span>
                              ) : (
                                <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                  d.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                  d.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                                  'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                }`}>
                                  {d.status}
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {!isPermitted && (
                                  <button
                                    onClick={async () => {
                                      const permitDate = new Date();
                                      permitDate.setDate(permitDate.getDate() + 2);
                                      const { error } = await supabase.from('student_dues').update({ permitted_until: permitDate.toISOString() }).eq('id', d.id);
                                      if (error) alert('Failed to permit student: ' + error.message);
                                      else {
                                        alert(`Permitted ${d.profiles?.full_name} for 2 days.`);
                                        fetchCollegeDues();
                                      }
                                    }}
                                    disabled={d.status !== 'pending'}
                                    className={`px-3 py-1.5 text-white text-xs font-bold rounded-lg transition-colors ${d.status === 'pending' ? 'bg-violet-500 hover:bg-violet-600' : 'bg-violet-300 cursor-not-allowed opacity-50'}`}
                                  >
                                    Permit
                                  </button>
                                )}
                                <button
                                  onClick={() => handleManualFeeUpdate(d.id, d.fine_amount || 0, d.fine_amount || 0, d.profiles?.full_name || 'Unknown')}
                                  disabled={d.status !== 'pending'}
                                  className={`px-3 py-1.5 text-white text-xs font-bold rounded-lg transition-colors ${d.status === 'pending' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-emerald-300 cursor-not-allowed opacity-50'}`}
                                >
                                  Clear Accounts
                                </button>
                              </div>
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

      {/* ========= TEACHER DETAILS TAB ========= */}
      {activeTab === 'teacherDetails' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-500" />
                Teacher Details & Section Assignments
              </h2>
              <p className="text-muted-foreground text-sm">View all teachers and their assigned subjects with sections.</p>
            </div>
            <button
              onClick={handleExportTeacherCSV}
              disabled={teacherAssignments.length === 0}
              className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              Export CSV
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full md:max-w-sm">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by teacher, subject, or section..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
              value={searchTeachers}
              onChange={e => setSearchTeachers(e.target.value)}
            />
          </div>

          {/* Stats Summary */}
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

          {/* Teacher Cards */}
          <div className="space-y-4">
            {loadingTeacherDetails ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse bg-card rounded-3xl shadow-sm border border-border">Loading teacher details...</div>
            ) : filteredTeacherDetails.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center bg-card rounded-3xl shadow-sm border border-border">
                <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                  <GraduationCap className="w-10 h-10 text-emerald-500/50" />
                </div>
                <h3 className="text-xl font-bold text-foreground">No Teachers Found</h3>
                <p className="text-muted-foreground mt-2">No teachers or faculty are assigned to your department yet.</p>
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
                                {teacher.assignments.length} subject{teacher.assignments.length !== 1 ? 's' : ''} Â· {[...new Set(teacher.assignments.flatMap(a => a.sections))].length} section{[...new Set(teacher.assignments.flatMap(a => a.sections))].length !== 1 ? 's' : ''}
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
                            <p className="text-sm">This teacher has no subjects or sections assigned yet.</p>
                            <p className="text-xs mt-1">Assign subjects from the Staff Dashboard.</p>
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
              <Clock className="w-5 h-5 text-emerald-500" />
              Staff Activity Logs
            </h2>
            <p className="text-muted-foreground text-sm">
              View recent activities performed by staff and teachers in your department.
            </p>
          </div>

          <div className="relative w-full md:max-w-xs">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search logs..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full"
              value={searchLogs}
              onChange={e => setSearchLogs(e.target.value)}
            />
          </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {loadingLogs ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">Loading activity logs...</div>
            ) : (() => {
              const filteredLogs = activityLogs.filter(log =>
                log.user_name?.toLowerCase().includes(searchLogs.toLowerCase()) ||
                log.action?.toLowerCase().includes(searchLogs.toLowerCase()) ||
                log.details?.toLowerCase().includes(searchLogs.toLowerCase())
              );
              return filteredLogs.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
                    <Clock className="w-10 h-10 text-emerald-500/50" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">No Logs Found</h3>
                  <p className="text-muted-foreground mt-2">No recent activity from staff/teachers matches your search.</p>
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
                              {log.user_role || 'staff'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">
                              {log.action}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-muted-foreground">{log.details || 'â€”'}</td>
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

      {/* ========= STUDENT DUES OVERVIEW TAB ========= */}
      {activeTab === 'studentdues' && profile?.department_id && (
        <StudentDuesOverviewTab departmentId={profile.department_id} role="hod" />
      )}

      {/* ========= ATTENDANCE FINES TAB ========= */}
      {activeTab === 'attendances' && profile?.department_id && (
        <AttendanceFinesTab departmentId={profile.department_id} role="hod" />
      )}

    </div>
  );
}

