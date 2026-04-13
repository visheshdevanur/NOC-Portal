import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import {
  getHodPendingRequests, approveHodRequest, getUsersByDeptAndRoles,
  getDepartmentById, getHodDepartmentStudents
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import {
  CheckCircle2, UserCog, Search, Users, Activity, X,
  Trash2, UserPlus, Download, User, ChevronDown, ChevronRight
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
  profiles: { full_name: string } | null;
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

type TabType = 'approvals' | 'users' | 'students';

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

  // Students state
  const [departmentStudents, setDepartmentStudents] = useState<UserProfile[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());
  const [searchStudents, setSearchStudents] = useState('');

  useEffect(() => {
    if (user && profile?.department_id) {
      fetchDeptName();
      if (activeTab === 'approvals') fetchRequests();
      if (activeTab === 'users') fetchUsers();
      if (activeTab === 'students') fetchStudents();
    }
  }, [user, activeTab, profile?.department_id]);

  useEffect(() => {
    if (user) {
      const channel = supabase.channel('hod-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clearance_requests', filter: `current_stage=eq.hod_review` }, () => {
          if (activeTab === 'approvals') fetchRequests();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); }
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
      setRequests(data as unknown as ClearanceRequest[]);
    } catch (err) { console.error(err); }
    finally { setLoadingReqs(false); }
  };

  const fetchStudents = async () => {
    if (!profile?.department_id) return;
    setLoadingStudents(true);
    try {
      const data = await getHodDepartmentStudents(profile.department_id);
      setDepartmentStudents(data as unknown as UserProfile[]);
    } catch (err) { console.error(err); }
    finally { setLoadingStudents(false); }
  };

  const fetchUsers = async () => {
    if (!profile?.department_id) return;
    setLoadingUsers(true);
    try {
      const data = await getUsersByDeptAndRoles(profile.department_id, ['staff', 'teacher', 'faculty']);
      setDepartmentUsers(data as UserProfile[]);
    } catch (err) { console.error(err); }
    finally { setLoadingUsers(false); }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveHodRequest(id);
      const req = requests.find(r => r.id === id);
      if (req) {
        await supabase.from('notifications').insert([{
          user_id: req.student_id,
          title: 'Final Clearance Approved!',
          message: 'HOD has approved your final clearance. You can now download your hall ticket.',
          type: 'success'
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
          message: 'HOD has approved your final clearance. You can now download your hall ticket.',
          type: 'success'
        }]);
      }
      fetchRequests();
    } catch (err: any) {
      alert("Error during bulk approval: " + getFriendlyErrorMessage(err));
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
        department_id: profile.department_id,
      });
      if (profileError) throw profileError;

      setUserSuccess(`${newUser.role === 'staff' ? 'Staff' : 'Teacher'} "${newUser.full_name}" created!`);
      setNewUser({ email: '', password: '', full_name: '', role: 'staff' });
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
      return `"${student.full_name}","${(student as any).roll_number || 'N/A'}","${sem}","${student.section || 'N/A'}","${status}","${stage}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dept_students_export.csv`;
    a.click();
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
      return `"${student.full_name}","${(student as any).roll_number || 'N/A'}","${sem}","${student.section || 'N/A'}","${req.status}","${req.current_stage}","${appliedDate}","${updatedDate}"`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dept_clearance_details.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'approvals', label: 'Clearances', icon: <Activity className="w-4 h-4" /> },
    { id: 'users', label: 'Staff & Teachers', icon: <Users className="w-4 h-4" /> },
    { id: 'students', label: 'Students', icon: <User className="w-4 h-4" /> }
  ];

  const toggleSem = (semName: string) => {
    const next = new Set(expandedSems);
    if (next.has(semName)) next.delete(semName);
    else next.add(semName);
    setExpandedSems(next);
  };

  // Filter students by search
  const filteredStudents = departmentStudents.filter(s =>
    s.full_name?.toLowerCase().includes(searchStudents.toLowerCase()) ||
    (s as any).roll_number?.toLowerCase().includes(searchStudents.toLowerCase()) ||
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
            HOD — {deptName}
          </h1>
          <p className="text-muted-foreground">Manage clearances, staff, teachers, and subjects.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border flex gap-1 w-full md:w-max">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all ${
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
              <span>✓ {userSuccess}</span>
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
            <button
              onClick={() => setShowCreateUser(true)}
              className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-5 py-3 rounded-xl font-bold transition-all shadow-sm"
            >
              <UserPlus className="w-5 h-5" />
              Add Staff / Teacher
            </button>
          </div>

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
            ) : filteredUsers.length === 0 ? (
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

    </div>
  );
}
