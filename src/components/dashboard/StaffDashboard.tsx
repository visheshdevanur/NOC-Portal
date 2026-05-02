import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import {
  getUsersByDeptAndRoles,
  getSubjectsByDepartment, createSubject, deleteSubject, getDepartmentSections,
  assignTeacherToSection, updateSubjectAPI, getDepartmentById, getStaffAttendanceFines, getSemestersByDepartment, updateUserAPI,
  updateStudentPaidAmount
} from '../../lib/api';
import { supabase } from '../../lib/supabase';

import {
  X, Search, BookOpen, Users, UserPlus,
  Plus, Trash2, Settings, GraduationCap, Link2, FileWarning, Activity, Eye, Download, Upload, ClipboardList
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

type TabType = 'users' | 'subjects' | 'sections' | 'attendances' | 'dues' | 'logs' | 'studentdues' | 'managesections';

type Semester = {
  id: string;
  name: string;
  department_id: string;
};

// Helper: detect 1st/2nd year semesters by name
const isFirstYearSem = (name: string) => {
  if (!name) return false;
  const trimmed = name.trim();
  // Semester names are "1", "2", "3", etc. — only 1 and 2 are first year
  return trimmed === '1' || trimmed === '2';
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
  
  // Attendance Categories State
  const [categories, setCategories] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catForm, setCatForm] = useState({ label: '', minPct: '', maxPct: '', amount: '' });
  const [catError, setCatError] = useState<string | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [massFineResult, setMassFineResult] = useState<string | null>(null);
  
  // Reduce Fine State
  const [reduceFineId, setReduceFineId] = useState<string | null>(null);
  const [reduceFineAmount, setReduceFineAmount] = useState('');
  const [reduceFineLoading, setReduceFineLoading] = useState(false);
  const [clearFineLoading, setClearFineLoading] = useState<string | null>(null);
   
  // Attendances CSV State
  const [attCsvUploading, setAttCsvUploading] = useState(false);
  const [attCsvError, setAttCsvError] = useState<string | null>(null);
  const [attCsvSuccess, setAttCsvSuccess] = useState<string | null>(null);

  // Search states for tabs
  const [searchAttendances, setSearchAttendances] = useState('');
  const [searchDues, setSearchDues] = useState('');
  const [searchSubjects, setSearchSubjects] = useState('');

  // Activity Logs State
  const [staffLogs, setStaffLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsSearch, setLogsSearch] = useState('');

  // Student Dues Overview State (read-only combined view)
  const [studentDuesOverview, setStudentDuesOverview] = useState<any[]>([]);
  const [studentDuesLoading, setStudentDuesLoading] = useState(false);
  const [studentDuesSearch, setStudentDuesSearch] = useState('');
  const [csvSemFilter, setCsvSemFilter] = useState<string>('all');

  // Manage Sections State
  const [mgSemesterId, setMgSemesterId] = useState<string>('');
  const [mgSections, setMgSections] = useState<string[]>([]);
  const [mgStudents, setMgStudents] = useState<any[]>([]);
  const [mgLoading, setMgLoading] = useState(false);
  const [mgNewSection, setMgNewSection] = useState('');

  const [mgError, setMgError] = useState<string | null>(null);
  const [mgSuccess, setMgSuccess] = useState<string | null>(null);
  const [mgUploading, setMgUploading] = useState(false);
  const [mgSearch, setMgSearch] = useState('');
  const [mgSectionFilter, setMgSectionFilter] = useState<string>('all');
  const [mgAssignments, setMgAssignments] = useState<Record<string, string>>({});
  const [mgSaving, setMgSaving] = useState(false);

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
    if (activeTab === 'attendances') { fetchAttendances(); fetchCategories(); }
    if (activeTab === 'dues') fetchDues();
    if (activeTab === 'logs') fetchStaffLogs();
    if (activeTab === 'studentdues') { fetchStudentDuesOverview(); fetchSemesters(); }
    if (activeTab === 'managesections') { fetchSemesters(); }
  }, [activeTab, profile?.department_id]);

  const fetchDues = async () => {
    if (!profile?.department_id) return;
    setLoadingDues(true);
    try {
      const data = await import('../../lib/api').then(m => m.getStaffStudentDues(profile.department_id!));
      // Staff excludes 1st/2nd sem students (Clerk handles those)
      const filtered = (data || []).filter((d: any) => {
        const semName = d.profiles?.semesters?.name || '';
        return !isFirstYearSem(semName);
      });
      setDepartmentDues(filtered);
    } catch (err) { console.error(err); }
    finally { setLoadingDues(false); }
  };

  const handleApproveDue = async (dueId: string) => {
    const due = departmentDues.find(d => d.id === dueId);
    if (!confirm("Approve this student's college fee due?")) return;
    try {
      await import('../../lib/api').then(m => m.markStudentDues(dueId, 'completed', due?.fine_amount || 0));
      fetchDues();
    } catch (err: any) {
      alert("Failed to approve due: " + getFriendlyErrorMessage(err));
    }
  };

  const handlePaidAmountUpdate = async (dueId: string, paidAmount: number) => {
    try {
      await updateStudentPaidAmount(dueId, paidAmount);
      // Update local state
      setDepartmentDues(prev => prev.map(d => d.id === dueId ? { ...d, paid_amount: paidAmount } : d));
    } catch (err: any) {
      alert('Failed to update paid amount: ' + getFriendlyErrorMessage(err));
    }
  };

  const fetchDeptName = async () => {
    if (!profile?.department_id) return;
    try {
      const dept = await getDepartmentById(profile.department_id);
      setDeptName(dept?.name || profile.department_id);
    } catch { setDeptName(profile.department_id); }
  };

  // ==================== ACTIVITY LOGS ======================
  const fetchStaffLogs = async () => {
    if (!profile?.department_id) return;
    setLogsLoading(true);
    try {
      // Fetch logs for faculty/teacher roles in this department
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('department_id', profile.department_id)
        .in('user_role', ['faculty', 'teacher'])
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      setStaffLogs(data || []);
    } catch (err: any) { console.error('Failed to fetch faculty logs:', err); }
    finally { setLogsLoading(false); }
  };

  const filteredStaffLogs = staffLogs.filter(log =>
    log.user_name?.toLowerCase().includes(logsSearch.toLowerCase()) ||
    log.action?.toLowerCase().includes(logsSearch.toLowerCase()) ||
    log.details?.toLowerCase().includes(logsSearch.toLowerCase())
  );

  // ==================== STUDENT DUES OVERVIEW (READ-ONLY) ======================
  const fetchStudentDuesOverview = async () => {
    if (!profile?.department_id) return;
    setStudentDuesLoading(true);
    try {
      // Fetch students in department
      const { data: allStudents, error: studErr } = await supabase
        .from('profiles')
        .select('id, full_name, roll_number, section, semester_id, semesters(name)')
        .eq('department_id', profile.department_id)
        .eq('role', 'student')
        .order('full_name');
      if (studErr) throw studErr;

      // Staff only sees higher semester students (not 1st/2nd)
      const students = (allStudents || []).filter((s: any) => {
        const semName = s.semesters?.name;
        if (!semName) return true;
        return !isFirstYearSem(semName);
      });

      const studentIds = students.map((s: any) => s.id);
      if (studentIds.length === 0) { setStudentDuesOverview([]); setStudentDuesLoading(false); return; }

      // Fetch library dues for these students
      const { data: libDues, error: libErr } = await supabase
        .from('library_dues')
        .select('student_id, has_dues, fine_amount, paid_amount, remarks')
        .in('student_id', studentIds);
      if (libErr) throw libErr;

      // Fetch college fee dues for these students
      const { data: collegeDues, error: colErr } = await supabase
        .from('student_dues')
        .select('student_id, fine_amount, status, paid_amount')
        .in('student_id', studentIds);
      if (colErr) throw colErr;

      // Fetch attendance fines for these students
      const { data: attendanceData, error: attErr } = await supabase
        .from('subject_enrollment')
        .select('student_id, attendance_fee, attendance_fee_verified')
        .in('student_id', studentIds);
      if (attErr) throw attErr;

      // Build maps
      const libMap = new Map((libDues || []).map((d: any) => [d.student_id, d]));
      const colMap = new Map((collegeDues || []).map((d: any) => [d.student_id, d]));
      const attMapUnpaid = new Map();
      const attMapPaid = new Map();
      (attendanceData || []).forEach((d: any) => {
        const fee = Number(d.attendance_fee) || 0;
        if (fee > 0) {
          if (d.attendance_fee_verified) {
            attMapPaid.set(d.student_id, (attMapPaid.get(d.student_id) || 0) + fee);
          } else {
            attMapUnpaid.set(d.student_id, (attMapUnpaid.get(d.student_id) || 0) + fee);
          }
        }
      });

      // Merge into combined records
      const combined = students.map((s: any) => ({
        ...s,
        library: libMap.get(s.id) || null,
        college: colMap.get(s.id) || null,
        attendance_fine_unpaid: attMapUnpaid.get(s.id) || 0,
        attendance_fine_paid: attMapPaid.get(s.id) || 0,
      }));

      setStudentDuesOverview(combined);
    } catch (err: any) {
      console.error('Failed to fetch student dues overview:', err);
    } finally {
      setStudentDuesLoading(false);
    }
  };

  const filteredStudentDuesOverview = studentDuesOverview.filter(s =>
    s.full_name?.toLowerCase().includes(studentDuesSearch.toLowerCase()) ||
    s.roll_number?.toLowerCase().includes(studentDuesSearch.toLowerCase()) ||
    s.section?.toLowerCase().includes(studentDuesSearch.toLowerCase())
  );

  const fetchData = async () => {
    // Legacy Dues fetch disabled
  };

  // ==================== ATTENDANCES ======================
  const fetchAttendances = async () => {
    if (!profile?.department_id) return;
    setLoadingAttendances(true);
    try {
      const data = await getStaffAttendanceFines(profile.department_id);
      // Staff excludes 1st/2nd sem students (Clerk handles those)
      const filtered = (data || []).filter((item: any) => {
        const semName = item.profiles?.semesters?.name || '';
        return !isFirstYearSem(semName);
      });
      setAttendanceFines(filtered);
    } catch (err) { console.error(err); }
    finally { setLoadingAttendances(false); }
  };

  const fetchCategories = async () => {
    if (!profile?.department_id) return;
    setLoadingCategories(true);
    try {
      const { getAttendanceCategories } = await import('../../lib/api');
      const data = await getAttendanceCategories(profile.department_id);
      setCategories(data);
    } catch (err) { console.error(err); }
    finally { setLoadingCategories(false); }
  };

  const downloadAttendanceDueTemplate = () => {
    const csvContent = "USN,Subject Code,Fine Amount\n1AB23CS001,CS101,500\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "Attendance_Dues_Template.csv";
    link.click();
  };

  const handleAttendanceDueCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.department_id) return;
    setAttCsvUploading(true);
    setAttCsvError(null);
    setAttCsvSuccess(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV is empty or missing data rows.');
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      
      const usnIdx = headers.findIndex(h => h.includes('usn') || h.includes('roll'));
      const subIdx = headers.findIndex(h => h.includes('subject'));
      const amtIdx = headers.findIndex(h => h.includes('amount') || h.includes('fine'));
      
      if (usnIdx === -1 || subIdx === -1 || amtIdx === -1) {
        throw new Error('CSV must have columns for USN, Subject Code, and Fine Amount.');
      }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const amount = parseInt(cols[amtIdx]);
        if (cols[usnIdx] && cols[subIdx] && !isNaN(amount) && amount > 0) {
          rows.push({
            roll_number: cols[usnIdx],
            subject_code: cols[subIdx],
            amount
          });
        }
      }

      if (rows.length === 0) throw new Error('No valid rows found to process.');
      
      const { bulkSetAttendanceDuesCSV } = await import('../../lib/api');
      const result = await bulkSetAttendanceDuesCSV(profile.department_id, rows);
      
      if (result.errors.length > 0) {
        setAttCsvError(`Updated ${result.updated}/${rows.length}. Errors: ${result.errors.slice(0, 3).join(' | ')}${result.errors.length > 3 ? '...' : ''}`);
      } else {
        setAttCsvSuccess(`Successfully assigned attendance dues for ${result.updated} records!`);
      }
      fetchAttendances();
    } catch (err: any) {
      setAttCsvError(getFriendlyErrorMessage(err));
    } finally {
      setAttCsvUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveCategory = async () => {
    const label = catForm.label.trim();
    const minPct = Number(catForm.minPct);
    const maxPct = Number(catForm.maxPct);
    const amount = Number(catForm.amount);
    if (!label) { setCatError('Label is required'); return; }
    if (isNaN(minPct) || isNaN(maxPct) || minPct < 0 || maxPct > 100 || minPct > maxPct) { setCatError('Invalid percentage range (0-100, min ≤ max)'); return; }
    if (isNaN(amount) || amount < 0) { setCatError('Fine amount must be ≥ 0'); return; }
    
    setCatSaving(true); setCatError(null);
    try {
      if (editingCat) {
        const { updateAttendanceCategory } = await import('../../lib/api');
        await updateAttendanceCategory(editingCat.id, label, minPct, maxPct, amount);
      } else {
        const { createAttendanceCategory } = await import('../../lib/api');
        await createAttendanceCategory(profile?.department_id || '', label, minPct, maxPct, amount);
      }
      setShowCatModal(false);
      setEditingCat(null);
      setCatForm({ label: '', minPct: '', maxPct: '', amount: '' });
      fetchCategories();
    } catch (err: any) {
      setCatError(getFriendlyErrorMessage(err));
    } finally {
      setCatSaving(false);
    }
  };

  const handleReduceFine = async (enrollmentId: string) => {
    const amt = Number(reduceFineAmount);
    if (isNaN(amt) || amt < 0) { alert('Enter a valid amount (≥ 0)'); return; }
    setReduceFineLoading(true);
    try {
      const { reduceStudentFine } = await import('../../lib/api');
      await reduceStudentFine(enrollmentId, amt);
      setReduceFineId(null);
      setReduceFineAmount('');
      fetchAttendances();
    } catch (err: any) {
      alert('Failed: ' + getFriendlyErrorMessage(err));
    } finally { setReduceFineLoading(false); }
  };

  const handleClearFine = async (enrollmentId: string) => {
    if (!confirm('Are you sure you want to mark this fine as PAID via cash? This will clear the student\'s attendance due.')) return;
    setClearFineLoading(enrollmentId);
    try {
      const { clearStudentFine } = await import('../../lib/api');
      await clearStudentFine(enrollmentId);
      await fetchAttendances();
      alert('Fine successfully cleared!');
    } catch (err: any) { alert('Failed to clear fine: ' + (err?.message || 'Unknown')); }
    finally { setClearFineLoading(null); }
  };

  // ==================== USERS ======================
  const fetchUsers = async () => {
    if (!profile?.department_id) return;
    setLoadingUsers(true);
    try {
      const data = await getUsersByDeptAndRoles(profile.department_id, ['teacher', 'faculty', 'student']);
      // Staff only handles higher semesters (not 1st/2nd) — also exclude FYC-managed teachers
      const sems = await getSemestersByDepartment(profile.department_id);
      const firstYearSemIds = new Set(sems.filter(s => isFirstYearSem(s.name)).map(s => s.id));
      const filtered = (data as UserProfile[]).filter(u => {
        if ((u.role === 'teacher' || u.role === 'faculty') && (u as any).created_by) return false;
        if (u.role === 'student') {
          // Exclude 1st/2nd sem students
          return u.semester_id ? !firstYearSemIds.has(u.semester_id) : true;
        }
        return true;
      });
      setDepartmentUsers(filtered);
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

      const { tempSupabase } = await import('../../lib/supabase');
      
      const fetchedSemesters = await import('../../lib/api').then(m => m.getSemestersByDepartment(profile.department_id!));

      let successCount = 0;
      let errorCount = 0;
      let errorDetails: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',').map(c => c.trim());
        const getVal = (colName: string) => columns[headers.indexOf(colName)] || '';
        
        const email = getVal('email');
        const password = getVal('password');
        const full_name = getVal('full_name');
        const role = getVal('role').toLowerCase();
        
        if (!email || !password || !full_name || !['student', 'teacher'].includes(role)) {
          errorCount++;
          errorDetails.push(`Row ${i + 1} (${email || 'Unknown'}): Missing email, password, full_name or invalid role.`);
          continue; 
        }

        if (password.length < 6) {
          errorCount++;
          errorDetails.push(`Row ${i + 1} (${email}): Password must be at least 6 characters.`);
          continue;
        }

        const roll = getVal('roll_number');
        const section = getVal('section');
        const semNameOrId = getVal('semester_id');
        
        let existingProfile = null;
        
        // Try to find existing user by email or roll_number
        const { data: existingData } = await supabase
          .from('profiles')
          .select('id, email, roll_number')
          .or(`email.eq.${email}${roll ? `,roll_number.eq.${roll}` : ''}`)
          .limit(1);
          
        if (existingData && existingData.length > 0) {
          existingProfile = existingData[0];
        }

        let profileData: any = {
          full_name,
          role,
          department_id: profile.department_id,
        };

        if (role === 'student') {
          if (section) profileData.section = section.toUpperCase();
          if (roll) profileData.roll_number = roll;
          
          if (semNameOrId) {
            const matchedSem = fetchedSemesters.find(s => s.name.toLowerCase() === semNameOrId.toLowerCase() || s.id === semNameOrId);
            if (matchedSem) {
              if (isFirstYearSem(matchedSem.name)) {
                errorCount++;
                errorDetails.push(`Row ${i + 1} (${email}): these(1,2) sem students cannot be inserted`);
                continue;
              }
              profileData.semester_id = matchedSem.id;
            } else {
              errorCount++;
              errorDetails.push(`Row ${i + 1} (${email}): Target semester "${semNameOrId}" not found in database.`);
              continue;
            }
          }
        } else if (role === 'teacher') {
             // Teachers don't need section/sem but might have an ID in roll_number
             if (roll) profileData.roll_number = roll;
        }

        if (existingProfile) {
           // Update existing profile
           const { error: updateError } = await supabase
             .from('profiles')
             .update(profileData)
             .eq('id', existingProfile.id);
             
           if (updateError) {
              errorCount++;
              errorDetails.push(`Row ${i + 1} (${email}): Update error - ${updateError.message}`);
              continue;
           }
           
           // Optionally update auth credentials if email changed (skip for now to keep it simple and avoid RPC overhead in loop)
        } else {
           // Create new user
           const { data: authData, error: authError } = await tempSupabase.auth.signUp({
             email, password
           });
           
           if (authError || !authData.user) {
             errorCount++;
             errorDetails.push(`Row ${i + 1} (${email}): Auth error - ${authError?.message || 'Unknown'}`);
             continue;
           }
           
           profileData.id = authData.user.id;
           profileData.email = email;
           
           const { error: insertError } = await supabase.from('profiles').insert(profileData);
           if (insertError) {
             errorCount++;
             errorDetails.push(`Row ${i + 1} (${email}): Profile insert error - ${insertError.message}`);
             continue;
           }
        }

        successCount++;
      }
      
      if (errorCount > 0) {
        setUserError(`Uploaded ${successCount} users. Encountered errors on ${errorCount} rows. Details: ${errorDetails.slice(0, 3).join(' | ')}${errorDetails.length > 3 ? '...' : ''}`);
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
    if (newUser.role === 'student') {
      if (!newUser.section) {
        setUserError('Section is required for students.');
        setUserCreating(false);
        return;
      }
      if (!newUser.roll_number) {
        setUserError('USN is required for students.');
        setUserCreating(false);
        return;
      }
    }
    if (newUser.role === 'teacher' && !newUser.teacher_id) {
      setUserError('Teacher ID is required for teachers.');
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
      const { deleteUser } = await import('../../lib/api');
      await deleteUser(userId);
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
      let errorDetails: string[] = [];

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
          errorDetails.push(`Row ${i + 1}: Missing code, name, or semester.`);
          continue; 
        }

        const sem = fetchedSemesters.find(s => s.name.toLowerCase() === semester_name.toLowerCase() || s.id === semester_name);
        if (!sem) {
          errorCount++;
          errorDetails.push(`Row ${i + 1} (${subject_code}): Target semester "${semester_name}" not found in database.`);
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
           errorDetails.push(`Row ${i + 1} (${subject_code}): DB Error - ${error.message}`);
        } else {
           successCount++;
        }
      }
      
      if (errorCount > 0) {
        setSubjectError(`Uploaded ${successCount} subjects. Encountered errors on ${errorCount} rows. Details: ${errorDetails.slice(0, 3).join(' | ')}${errorDetails.length > 3 ? '...' : ''}`);
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
      // Staff only sees higher semester subjects (not 1st/2nd)
      const filtered = (data as Subject[]).filter(s => {
        const semName = (s as any).semesters?.name;
        if (!semName) return true;
        return !isFirstYearSem(semName);
      });
      setSubjects(filtered);
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
    try {
      const data = await getSemestersByDepartment(profile.department_id);
      // Filter the semesters to exclude 1st and 2nd year for staff rendering
      const filtered = (data as Semester[]).filter(s => !isFirstYearSem(s.name));
      setSemestersList(filtered);
    } catch (err) { console.error(err); }
  };

  // ==================== SECTION ASSIGN ======================
  const fetchSectionData = async () => {
    if (!profile?.department_id) return;
    try {
      const [secs, subs, allTeachers] = await Promise.all([
        getDepartmentSections(profile.department_id),
        getSubjectsByDepartment(profile.department_id),
        getUsersByDeptAndRoles(profile.department_id, ['teacher', 'faculty']),
      ]);
      setSections(secs);
      setDeptSubjects(subs as Subject[]);
      // Exclude FYC-managed teachers from section assignment dropdown
      setDeptTeachers((allTeachers || []).filter((t: any) => !t.created_by));
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
      if (!result || result.length === 0) {
        setSectionError(`Cannot assign teacher: Section "${selectedSection}" currently has no students in the selected semester. Please assign students to this section first.`);
      } else {
        setSectionSuccess(`Section "${selectedSection}" assigned to ${teacherName} for the selected subject. ${result.length} student enrollments updated.`);
        setSelectedSection('');
        setSelectedSubject('');
        setSelectedTeacher('');
      }
    } catch (err: any) {
      setSectionError(getFriendlyErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  const [sectionCsvUploading, setSectionCsvUploading] = useState(false);

  const downloadSectionAssignTemplate = () => {
    const csvContent = "Semester Name,Subject Code,Section,Teacher ID\nSemester 3,CS301,A,TCH301\nSemester 3,CS302,B,TCH302\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "Section_Assign_Template.csv";
    link.click();
  };

  const handleSectionAssignCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.department_id) return;
    setSectionCsvUploading(true);
    setSectionError(null);
    setSectionSuccess(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV is empty or missing data rows.');
      
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      const semIdx = headers.findIndex(h => h.includes('semester'));
      const subIdx = headers.findIndex(h => h.includes('subject'));
      const secIdx = headers.findIndex(h => h.includes('section'));
      const tIdx = headers.findIndex(h => h.includes('teacher'));
      
      if (semIdx === -1 || subIdx === -1 || secIdx === -1 || tIdx === -1) {
        throw new Error('CSV must have columns for Semester Name, Subject Code, Section, and Teacher ID.');
      }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols[semIdx] && cols[subIdx] && cols[secIdx] && cols[tIdx]) {
          rows.push({
            semester_name: cols[semIdx],
            subject_code: cols[subIdx],
            section: cols[secIdx],
            teacher_id: cols[tIdx]
          });
        }
      }

      if (rows.length === 0) throw new Error('No valid rows found to process.');
      
      const { bulkAssignTeacherToSectionCSV } = await import('../../lib/api');
      const result = await bulkAssignTeacherToSectionCSV(profile.department_id, rows);
      
      if (result.updated === 0 && result.errors.length === 0) {
        setSectionError('No assignments were made. Ensure the sections have students assigned to them.');
      } else if (result.errors.length > 0) {
        setSectionError(`Updated ${result.updated} sections. Errors: ${result.errors.slice(0, 3).join(' | ')}${result.errors.length > 3 ? '...' : ''}`);
      } else {
        setSectionSuccess(`Successfully assigned ${result.updated} sections from CSV!`);
      }
    } catch (err: any) {
      setSectionError(getFriendlyErrorMessage(err));
    } finally {
      setSectionCsvUploading(false);
      e.target.value = '';
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

  // ==================== MANAGE SECTIONS ====================
  const fetchMgData = async (semId: string) => {
    if (!profile?.department_id) return;
    setMgLoading(true);
    setMgAssignments({});
    try {
      const { getSectionsForSemester } = await import('../../lib/api');
      const secs = await getSectionsForSemester(profile.department_id, semId);
      setMgSections(secs);

      // Fetch all students for this semester
      const { data: students, error } = await supabase
        .from('profiles')
        .select('id, full_name, roll_number, section')
        .eq('department_id', profile.department_id)
        .eq('semester_id', semId)
        .eq('role', 'student')
        .order('full_name');
      if (error) throw error;
      setMgStudents(students || []);
    } catch (err: any) {
      console.error('Failed to fetch manage sections data:', err);
      setMgError(getFriendlyErrorMessage(err));
    } finally { setMgLoading(false); }
  };

  const handleCreateSection = async () => {
    if (!mgNewSection.trim()) { setMgError('Section name is required.'); return; }
    if (mgSections.includes(mgNewSection.trim().toUpperCase())) { setMgError('Section already exists.'); return; }
    const newSec = mgNewSection.trim().toUpperCase();
    setMgSections(prev => [...prev, newSec].sort());
    setMgNewSection('');
    setMgSuccess(`Section "${newSec}" created. It is now available in dropdowns.`);
  };

  const handleDeleteSection = async (sectionName: string) => {
    if (!profile?.department_id || !mgSemesterId) return;
    if (!confirm(`Remove section "${sectionName}"? All students in this section will become unassigned.`)) return;
    try {
      const { deleteSection: delSec } = await import('../../lib/api');
      const count = await delSec(profile.department_id, mgSemesterId, sectionName);
      setMgSuccess(`Section "${sectionName}" deleted. ${count} students unassigned.`);
      fetchMgData(mgSemesterId);
    } catch (err: any) {
      setMgError(getFriendlyErrorMessage(err));
    }
  };



  // Bulk save all dropdown assignments at once
  const handleBulkSaveAssignments = async () => {
    const entries = Object.entries(mgAssignments).filter(([studentId, newSection]) => {
      const student = mgStudents.find(s => s.id === studentId);
      return student && (student.section || '') !== newSection;
    });
    if (entries.length === 0) { setMgError('No changes to save.'); return; }
    setMgSaving(true);
    setMgError(null);
    setMgSuccess(null);
    try {
      const { bulkAssignSections } = await import('../../lib/api');
      const assignments = entries.map(([student_id, section]) => ({ student_id, section }));
      const updated = await bulkAssignSections(assignments);
      setMgSuccess(`Saved section assignments for ${updated} students!`);
      setMgAssignments({});
      fetchMgData(mgSemesterId);
    } catch (err: any) {
      setMgError(getFriendlyErrorMessage(err));
    } finally { setMgSaving(false); }
  };

  // Download CSV template pre-filled with student data
  const handleDownloadSectionTemplate = () => {
    if (mgStudents.length === 0) { setMgError('No students to export.'); return; }
    const semName = semestersList.find(s => s.id === mgSemesterId)?.name || '';
    const header = 'USN,Student Name,Department,Semester,Section\n';
    const rows = mgStudents.map(s =>
      `"${s.roll_number || ''}","${s.full_name || ''}","${deptName}","${semName}",""`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Section_Template_Sem${semName}_${deptName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMgSuccess('CSV template downloaded. Fill the Section column and upload it back.');
  };

  const handleMgCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile?.department_id) return;
    setMgUploading(true);
    setMgError(null);
    setMgSuccess(null);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) throw new Error('CSV file is empty or missing data rows.');

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const usnIdx = headers.findIndex(h => h === 'usn' || h === 'roll_number' || h === 'rollnumber');
      const secIdx = headers.findIndex(h => h === 'section');
      if (usnIdx < 0 || secIdx < 0) throw new Error('CSV must have "USN" (or "roll_number") and "Section" columns.');

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols[usnIdx] && cols[secIdx]) {
          rows.push({ roll_number: cols[usnIdx], section: cols[secIdx] });
        }
      }
      if (rows.length === 0) throw new Error('No valid rows found in CSV.');

      const { bulkAssignSectionsCSV } = await import('../../lib/api');
      const result = await bulkAssignSectionsCSV(profile.department_id, rows);
      if (result.errors.length > 0) {
        setMgError(`Updated ${result.updated}/${rows.length}. Errors: ${result.errors.slice(0, 3).join(' | ')}`);
      } else {
        setMgSuccess(`Successfully assigned sections to ${result.updated} students!`);
      }
      fetchMgData(mgSemesterId);
    } catch (err: any) {
      setMgError(getFriendlyErrorMessage(err));
    } finally {
      setMgUploading(false);
      event.target.value = '';
    }
  };

  // Filtered students for manage sections
  const filteredMgStudents = mgStudents.filter(s => {
    const matchesSearch = !mgSearch ||
      s.full_name?.toLowerCase().includes(mgSearch.toLowerCase()) ||
      s.roll_number?.toLowerCase().includes(mgSearch.toLowerCase());
    const matchesSection = mgSectionFilter === 'all' ||
      (mgSectionFilter === 'unassigned' ? !s.section : s.section === mgSectionFilter);
    return matchesSearch && matchesSection;
  });

  // Count of pending (changed) assignments
  const pendingAssignmentCount = Object.entries(mgAssignments).filter(([studentId, newSection]) => {
    const student = mgStudents.find(s => s.id === studentId);
    return student && (student.section || '') !== newSection;
  }).length;


  const roleColors: Record<string, string> = {
    student: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    faculty: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    teacher: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    staff: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'attendances', label: 'Attendance Fines', icon: <FileWarning className="w-4 h-4 text-destructive" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'sections', label: 'Section Assign', icon: <Link2 className="w-4 h-4" /> },
    { id: 'studentdues', label: 'Student Dues', icon: <Eye className="w-4 h-4 text-indigo-500" /> },
    { id: 'logs', label: 'Activity Logs', icon: <Activity className="w-4 h-4" /> },
    { id: 'managesections', label: 'Manage Sections', icon: <ClipboardList className="w-4 h-4" /> },
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
        <div className="space-y-6">
          {/* Attendance Categories Panel */}
          <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-500" />
                  Attendance Fine Categories
                </h2>
                <p className="text-muted-foreground text-sm mt-1">Define attendance % ranges and their corresponding fine amounts.</p>
              </div>
            </div>

            {loadingCategories ? (
              <div className="p-4 text-center text-muted-foreground animate-pulse text-sm">Loading categories...</div>
            ) : categories.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-border rounded-2xl">
                <p className="text-muted-foreground text-sm">No categories configured yet. Create categories to enable mass fine assignment.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-3 font-semibold">Label</th>
                      <th className="p-3 font-semibold text-center">Min %</th>
                      <th className="p-3 font-semibold text-center">Max %</th>
                      <th className="p-3 font-semibold text-center">Fine (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categories.map((cat: any) => (
                      <tr key={cat.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-3 font-medium text-foreground">{cat.label}</td>
                        <td className="p-3 text-center"><span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-md text-xs font-bold">{cat.min_pct}%</span></td>
                        <td className="p-3 text-center"><span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-md text-xs font-bold">{cat.max_pct}%</span></td>
                        <td className="p-3 text-center font-bold text-amber-600">₹{cat.fine_amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Category Modal */}
          {showCatModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-foreground">{editingCat ? 'Edit Category' : 'Add Category'}</h3>
                  <button onClick={() => setShowCatModal(false)} className="p-2 rounded-xl hover:bg-secondary transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
                </div>
                {catError && <div className="p-3 mb-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">{catError}</div>}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Label</label>
                    <input type="text" placeholder="e.g. Moderate Shortage" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.label} onChange={e => setCatForm({...catForm, label: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Min Attendance %</label>
                      <input type="number" min="0" max="100" placeholder="e.g. 65" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.minPct} onChange={e => setCatForm({...catForm, minPct: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Max Attendance %</label>
                      <input type="number" min="0" max="100" placeholder="e.g. 79" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.maxPct} onChange={e => setCatForm({...catForm, maxPct: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Fine Amount (₹)</label>
                    <input type="number" min="0" placeholder="e.g. 500" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={catForm.amount} onChange={e => setCatForm({...catForm, amount: e.target.value})} />
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={() => setShowCatModal(false)} className="flex-1 py-3 px-4 rounded-xl border border-border font-medium hover:bg-secondary">Cancel</button>
                  <button onClick={handleSaveCategory} disabled={catSaving} className="flex-1 py-3 px-4 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-50">
                    {catSaving ? 'Saving...' : editingCat ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex flex-col md:flex-row gap-4 justify-between">
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={downloadAttendanceDueTemplate}
                className="flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 border border-border px-4 py-3 rounded-xl font-medium transition-all shadow-sm text-sm"
              >
                <Download className="w-4 h-4" />
                Template
              </button>
              <label className="flex items-center gap-2 bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 border border-amber-500/30 px-4 py-3 rounded-xl font-bold transition-all shadow-sm text-sm cursor-pointer disabled:opacity-50">
                <Upload className="w-4 h-4" />
                {attCsvUploading ? 'Uploading...' : 'Bulk CSV'}
                <input type="file" accept=".csv" className="hidden" onChange={handleAttendanceDueCSVUpload} disabled={attCsvUploading} />
              </label>
            </div>
          </div>
          
          {/* Status Messages */}
          {massFineResult && <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center"><span>✅ {massFineResult}</span><button onClick={() => setMassFineResult(null)}><X className="w-4 h-4" /></button></div>}
          {attCsvSuccess && <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center"><span>✅ {attCsvSuccess}</span><button onClick={() => setAttCsvSuccess(null)}><X className="w-4 h-4" /></button></div>}
          {attCsvError && <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center"><span><strong>Error:</strong> {attCsvError}</span><button onClick={() => setAttCsvError(null)}><X className="w-4 h-4" /></button></div>}
          
          {/* Students Table */}
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
                        <th className="p-4 font-semibold">USN</th>
                        <th className="p-4 font-semibold">Section</th>
                        <th className="p-4 font-semibold">Subject</th>
                        <th className="p-4 font-semibold text-center">Attendance %</th>
                        <th className="p-4 font-semibold text-center">Fine (₹)</th>
                        <th className="p-4 font-semibold text-center">Status</th>
                        <th className="p-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(item => (
                        <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-4 font-medium text-foreground">{item.profiles?.full_name}</td>
                          <td className="p-4 text-sm font-mono text-muted-foreground">{item.profiles?.roll_number || '—'}</td>
                          <td className="p-4"><span className="px-2 py-1 bg-secondary rounded-md text-xs font-medium">{item.profiles?.section || 'None'}</span></td>
                          <td className="p-4">
                            <div className="text-sm font-medium">{item.subjects?.subject_name}</div>
                            <div className="text-xs text-muted-foreground">{item.subjects?.subject_code}</div>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-destructive font-bold">{item.attendance_pct}%</span>
                          </td>
                          <td className="p-4 text-center">
                            {item.attendance_fee > 0 ? (
                              <span className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap ${item.attendance_fee_verified ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                ₹{item.attendance_fee}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">Not set</span>
                            )}
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
                          <td className="p-4 text-right">
                            {reduceFineId === item.id ? (
                              <div className="flex items-center gap-2 justify-end">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="₹"
                                  className="w-24 p-2 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold"
                                  value={reduceFineAmount}
                                  onChange={e => setReduceFineAmount(e.target.value)}
                                  autoFocus
                                />
                                <button onClick={() => handleReduceFine(item.id)} disabled={reduceFineLoading} className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors">
                                  {reduceFineLoading ? '...' : 'Set'}
                                </button>
                                <button onClick={() => { setReduceFineId(null); setReduceFineAmount(''); }} className="px-2 py-2 bg-secondary hover:bg-secondary/80 rounded-xl transition-colors">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => { setReduceFineId(item.id); setReduceFineAmount(String(item.attendance_fee || 0)); }}
                                  className="px-3 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                                  title="Modify/Reduce Fine"
                                >
                                  Modify Fine
                                </button>
                                {item.attendance_fee > 0 && !item.attendance_fee_verified && (
                                  <button
                                    onClick={() => handleClearFine(item.id)}
                                    disabled={clearFineLoading === item.id}
                                    className="px-3 py-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap disabled:opacity-50"
                                    title="Mark as Paid (Cash)"
                                  >
                                    {clearFineLoading === item.id ? '...' : 'Clear Fine'}
                                  </button>
                                )}
                              </div>
                            )}
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
          {userError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
              <span><strong>Error:</strong> {userError}</span>
              <button onClick={() => setUserError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}
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
                      <label className="block text-sm font-medium text-foreground mb-1.5">Teacher ID</label>
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
                        <label className="block text-sm font-medium text-foreground mb-1.5">USN</label>
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
                        <td className="p-4 text-muted-foreground text-sm">{(u as any).semesters?.name || '—'}</td>
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-amber-500" />
                  Bulk Section ↔ Teacher Assignment
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Select a subject, section, and teacher. All students in the section will be enrolled and assigned to the teacher for that subject.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadSectionAssignTemplate}
                  className="flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 border border-border px-4 py-3 rounded-xl font-medium transition-all shadow-sm text-sm"
                >
                  <Download className="w-4 h-4" />
                  Template
                </button>
                <label className="flex items-center gap-2 bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 border border-amber-500/30 px-4 py-3 rounded-xl font-bold transition-all shadow-sm text-sm cursor-pointer disabled:opacity-50">
                  <Upload className="w-4 h-4" />
                  {sectionCsvUploading ? 'Uploading...' : 'Bulk CSV'}
                  <input type="file" accept=".csv" className="hidden" onChange={handleSectionAssignCSVUpload} disabled={sectionCsvUploading} />
                </label>
              </div>
            </div>

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
                  View students pending college fee dues. Enter paid amounts and approve payment clearance.
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
                          <th className="p-4 font-semibold">Paid (₹)</th>
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
                            <td className="p-4">
                              <input
                                type="number"
                                min="0"
                                className="w-24 p-2 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
                                defaultValue={d.paid_amount || 0}
                                onBlur={e => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== (d.paid_amount || 0)) handlePaidAmountUpdate(d.id, val);
                                }}
                              />
                            </td>
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

      {/* ========= STUDENT DUES OVERVIEW TAB (READ-ONLY) ========= */}
      {activeTab === 'studentdues' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Eye className="w-6 h-6 text-indigo-500" />
                Student Dues Overview
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                View library dues, college fee remarks, and payment status for all department students (read-only).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:max-w-lg">
              <div className="relative w-full sm:w-48">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
                  value={studentDuesSearch}
                  onChange={e => setStudentDuesSearch(e.target.value)}
                />
              </div>
              <select
                value={csvSemFilter}
                onChange={e => setCsvSemFilter(e.target.value)}
                className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[140px]"
              >
                <option value="all">All Semesters</option>
                {semestersList.map(sem => (
                  <option key={sem.id} value={sem.id}>{sem.name}</option>
                ))}
              </select>
              <button 
                onClick={() => {
                  const dataToExport = csvSemFilter === 'all'
                    ? filteredStudentDuesOverview
                    : filteredStudentDuesOverview.filter(s => s.semester_id === csvSemFilter);
                  if (!dataToExport || dataToExport.length === 0) return;
                  const semName = csvSemFilter === 'all' ? 'all_semesters' : (semestersList.find(s => s.id === csvSemFilter)?.name || 'semester').replace(/\s+/g, '_');
                  const headers = ['Student Name', 'Roll No', 'Section', 'Semester', 'Library Dues', 'Library Fine', 'Library Paid', 'Library Remaining', 'Library Remarks', 'College Status', 'College Fine', 'College Paid', 'College Remaining', 'Attendance Fine', 'Total Paid/Fines'];
                  const csvContent = [
                    headers.join(','),
                    ...dataToExport.map(s => {
                      const libFine = Number(s.library?.fine_amount) || 0;
                      const libPaid = Number(s.library?.paid_amount) || 0;
                      const colFine = Number(s.college?.fine_amount) || 0;
                      const colPaid = Number(s.college?.paid_amount) || 0;
                      const attFine = Number(s.attendance_fine) || 0;
                      const total = libPaid + colPaid + attFine;
                      return [
                        `"${s.full_name || ''}"`,
                        `"${s.roll_number || ''}"`,
                        `"${s.section || ''}"`,
                        `"${s.semesters?.name || ''}"`,
                        s.library?.has_dues ? 'Pending' : 'Clear',
                        libFine,
                        libPaid,
                        Math.max(0, libFine - libPaid),
                        `"${s.library?.remarks || ''}"`,
                        s.college?.status || 'N/A',
                        colFine,
                        colPaid,
                        Math.max(0, colFine - colPaid),
                        attFine,
                        total
                      ].join(',');
                    })
                  ].join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `student_dues_${semName}_${new Date().toISOString().split('T')[0]}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="whitespace-nowrap px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>
          </div>

          {/* Summary cards */}
          {!studentDuesLoading && studentDuesOverview.length > 0 && (() => {
            const libPending = studentDuesOverview.filter(s => s.library?.has_dues).length;
            const colPending = studentDuesOverview.filter(s => s.college?.status === 'pending').length;
            const totalStudents = studentDuesOverview.length;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card rounded-2xl p-5 border border-border shadow-sm">
                  <p className="text-sm text-muted-foreground font-medium">Total Students</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{totalStudents}</p>
                </div>
                <div className="bg-card rounded-2xl p-5 border border-orange-500/20 shadow-sm">
                  <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Library Dues Pending</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{libPending}</p>
                </div>
                <div className="bg-card rounded-2xl p-5 border border-red-500/20 shadow-sm">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">College Fee Pending</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{colPending}</p>
                </div>
              </div>
            );
          })()}

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/40 text-foreground text-sm border-b border-border">
                    <th className="p-4 font-semibold">#</th>
                    <th className="p-4 font-semibold">Student Name</th>
                    <th className="p-4 font-semibold">Roll No</th>
                    <th className="p-4 font-semibold">Section</th>
                    <th className="p-4 font-semibold">Semester</th>
                    <th className="p-4 font-semibold text-center">Library Dues</th>
                    <th className="p-4 font-semibold text-center">College Fee Status</th>
                    <th className="p-4 font-semibold">Attendance Fines (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {studentDuesLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground animate-pulse">Loading student dues overview...</td></tr>
                  ) : filteredStudentDuesOverview.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
                            <Eye className="w-8 h-8 text-muted-foreground/50" />
                          </div>
                          <h3 className="text-lg font-bold text-foreground">No Students Found</h3>
                          <p className="text-muted-foreground mt-2 text-sm">No students match your search criteria.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStudentDuesOverview.map((s, idx) => {
                      const hasLibDues = s.library?.has_dues;
                      const colStatus = s.college?.status || 'N/A';
                      const attFineUnpaid = Number(s.attendance_fine_unpaid) || 0;
                      const attFinePaid = Number(s.attendance_fine_paid) || 0;

                      return (
                        <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-4 text-sm text-muted-foreground">{idx + 1}</td>
                          <td className="p-4 font-medium text-foreground">{s.full_name}</td>
                          <td className="p-4 text-muted-foreground font-mono text-sm">{s.roll_number || '—'}</td>
                          <td className="p-4 text-muted-foreground">{s.section || '—'}</td>
                          <td className="p-4 text-muted-foreground text-sm">{s.semesters?.name || '—'}</td>
                          <td className="p-4 text-center">
                            {hasLibDues ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400">
                                Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                Clear
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            {colStatus === 'pending' ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400">
                                Pending
                              </span>
                            ) : colStatus === 'completed' ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                Completed
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-sm">
                            {attFineUnpaid > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">₹{attFineUnpaid} (Pending)</span>
                            ) : attFinePaid > 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400">₹{attFinePaid} (Paid)</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {!studentDuesLoading && filteredStudentDuesOverview.length > 0 && (
              <div className="px-4 py-3 bg-secondary/30 border-t border-border text-sm text-muted-foreground">
                Showing {filteredStudentDuesOverview.length} of {studentDuesOverview.length} student{studentDuesOverview.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========= ACTIVITY LOGS TAB ========= */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Activity className="w-6 h-6 text-amber-500" />
                Faculty / Teacher Activity Logs
              </h2>
              <p className="text-muted-foreground text-sm mt-1">Monitor faculty and teacher actions within your department.</p>
            </div>
            <div className="relative w-full md:max-w-xs">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by user, action, or details..."
                className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
                value={logsSearch}
                onChange={e => setLogsSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            <div className="border border-border rounded-2xl overflow-x-auto shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/40 text-foreground text-sm border-b border-border">
                    <th className="p-5 font-semibold">Date & Time</th>
                    <th className="p-5 font-semibold">Role</th>
                    <th className="p-5 font-semibold">User Name</th>
                    <th className="p-5 font-semibold">Action</th>
                    <th className="p-5 font-semibold w-1/3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {logsLoading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground animate-pulse">Loading faculty activity logs...</td></tr>
                  ) : filteredStaffLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
                            <Activity className="w-8 h-8 text-muted-foreground/50" />
                          </div>
                          <h3 className="text-lg font-bold text-foreground">No Faculty Logs Found</h3>
                          <p className="text-muted-foreground mt-2 text-sm">No recorded faculty/teacher activity matching your criteria.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStaffLogs.map(log => (
                      <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-5 text-sm whitespace-nowrap text-muted-foreground font-medium">
                          {new Date(log.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="p-5">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${roleColors[log.user_role] || 'bg-secondary text-foreground'}`}>
                            {log.user_role}
                          </span>
                        </td>
                        <td className="p-5 font-bold text-foreground">{log.user_name || 'System User'}</td>
                        <td className="p-5 text-sm font-medium text-primary">{log.action}</td>
                        <td className="p-5 text-sm text-foreground max-w-sm truncate" title={log.details || ''}>{log.details || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!logsLoading && filteredStaffLogs.length > 0 && (
              <div className="px-4 py-3 bg-secondary/30 border-t border-border text-sm text-muted-foreground">
                Showing {filteredStaffLogs.length} log{filteredStaffLogs.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========= MANAGE SECTIONS TAB ========= */}
      {activeTab === 'managesections' && (
        <div className="space-y-6">
          {mgSuccess && <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center"><span>✓ {mgSuccess}</span><button onClick={() => setMgSuccess(null)}><X className="w-4 h-4" /></button></div>}
          {mgError && <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center"><span><strong>Error:</strong> {mgError}</span><button onClick={() => setMgError(null)}><X className="w-4 h-4" /></button></div>}

          {/* Semester Selector */}
          <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-amber-500" />
              Manage Sections
            </h2>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-foreground mb-1.5">Select Semester</label>
                <select className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" value={mgSemesterId} onChange={e => { setMgSemesterId(e.target.value); if (e.target.value) fetchMgData(e.target.value); }}>
                  <option value="">Choose a semester...</option>
                  {semestersList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {mgSemesterId && (
                <div className="flex gap-3">
                  <div className="flex items-center gap-2">
                    <input type="text" className="px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-32" placeholder="e.g. A" value={mgNewSection} onChange={e => setMgNewSection(e.target.value)} />
                    <button onClick={handleCreateSection} className="flex items-center gap-2 bg-amber-500 text-white hover:bg-amber-600 px-5 py-3 rounded-xl font-bold transition-all">
                      <Plus className="w-4 h-4" /> Create
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {mgSemesterId && (
            <>
              {/* Current Sections */}
              <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-foreground">Sections in Semester {semestersList.find(s => s.id === mgSemesterId)?.name}</h3>
                  <label className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 px-5 py-3 rounded-xl font-medium border border-border transition-all cursor-pointer">
                    <Upload className="w-4 h-4" />
                    {mgUploading ? 'Uploading...' : 'Bulk CSV Upload'}
                    <input type="file" accept=".csv" className="hidden" onChange={handleMgCSVUpload} disabled={mgUploading} />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mb-4">CSV format: <code className="bg-secondary px-2 py-0.5 rounded">USN,Student Name,Section</code></p>
                {mgSections.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">No sections created yet. Create one above or upload via CSV.</div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {mgSections.map(sec => (
                      <div key={sec} className="flex items-center gap-2 bg-background border border-border rounded-xl px-4 py-2">
                        <span className="font-bold text-foreground">{sec}</span>
                        <span className="text-xs text-muted-foreground">({mgStudents.filter(s => s.section === sec).length})</span>
                        <button onClick={() => handleDeleteSection(sec)} className="p-1 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors" title="Delete section">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Students Table */}
              <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h3 className="font-bold text-foreground">Students ({filteredMgStudents.length})</h3>
                  
                  <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search by name or USN..."
                        className="pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-full md:w-64"
                        value={mgSearch}
                        onChange={e => setMgSearch(e.target.value)}
                      />
                    </div>
                    <select
                      className="px-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      value={mgSectionFilter}
                      onChange={e => setMgSectionFilter(e.target.value)}
                    >
                      <option value="all">All Sections</option>
                      <option value="unassigned">Unassigned</option>
                      {mgSections.map(sec => (
                        <option key={sec} value={sec}>Section {sec}</option>
                      ))}
                    </select>
                    
                    <button
                      onClick={handleDownloadSectionTemplate}
                      className="flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm"
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                      Template
                    </button>

                    {pendingAssignmentCount > 0 && (
                      <button
                        onClick={handleBulkSaveAssignments}
                        disabled={mgSaving}
                        className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
                      >
                        <Settings className="w-4 h-4" />
                        {mgSaving ? 'Saving...' : `Save All (${pendingAssignmentCount})`}
                      </button>
                    )}
                  </div>
                </div>
                {mgLoading ? (
                  <div className="p-8 text-center text-muted-foreground animate-pulse">Loading students...</div>
                ) : filteredMgStudents.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No students found matching your criteria.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                          <th className="p-4 font-semibold">Name</th>
                          <th className="p-4 font-semibold">Roll Number</th>
                          <th className="p-4 font-semibold">Section</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredMgStudents.map(s => {
                          const currentVal = mgAssignments[s.id] !== undefined ? mgAssignments[s.id] : (s.section || '');
                          const isChanged = currentVal !== (s.section || '');
                          
                          return (
                            <tr key={s.id} className={`transition-colors ${isChanged ? 'bg-amber-500/5' : 'hover:bg-secondary/20'}`}>
                              <td className="p-4 font-medium text-foreground">{s.full_name}</td>
                              <td className="p-4 text-muted-foreground font-mono text-sm">{s.roll_number || '—'}</td>
                              <td className="p-4">
                                <select 
                                  className={`px-3 py-1.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${isChanged ? 'border-amber-500 text-amber-700 dark:text-amber-400 font-bold' : 'border-border'}`}
                                  value={currentVal} 
                                  onChange={e => {
                                    setMgAssignments(prev => ({
                                      ...prev,
                                      [s.id]: e.target.value
                                    }));
                                  }}
                                >
                                  <option value="">Unassigned</option>
                                  {mgSections.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}


    </div>
  );
}

