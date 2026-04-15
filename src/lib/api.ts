import { supabase } from './supabase';

// =======================
// STUDENT SPECIFIC
// =======================
export const getStudentClearanceRequest = async (studentId: string) => {
  const { data, error } = await supabase
    .from('clearance_requests')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
};

export const submitClearanceRequest = async (studentId: string) => {
  const { data, error } = await supabase
    .from('clearance_requests')
    .insert([{ student_id: studentId, current_stage: 'faculty_review', status: 'pending' }] as any)
    .select()
    .single();
    
  if (error) throw error;
  return data;
};

export const getStudentSubjects = async (studentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, subjects(*), profiles!subject_enrollment_teacher_id_fkey(full_name)')
    .eq('student_id', studentId);
  if (error) throw error;
  return data;
};

export const getStudentDues = async (studentId: string) => {
  const { data, error } = await supabase
    .from('student_dues')
    .select('*')
    .eq('student_id', studentId);
  if (error) throw error;
  return data;
};

// =======================
// FACULTY SPECIFIC
// =======================
export const getFacultyPendingStudents = async (facultyId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name, section, semester_id, semesters(name)), subjects(*)')
    .eq('teacher_id', facultyId);
  if (error) throw error;
  return data;
};

export const markFacultySubjectStatus = async (
  enrollmentId: string, 
  status: string, 
  attendancePct: number, 
  remarks: string
) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ status: status as any, attendance_pct: attendancePct, remarks } as any)
    .eq('id', enrollmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// =======================
// ACCOUNTS SPECIFIC
// =======================
export const getAllStudentDues = async () => {
  const { data, error } = await supabase
    .from('student_dues')
    .select('*, profiles!student_dues_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name))');

  if (error) throw error;
  return data;
};

export const markStudentDues = async (
  duesModuleId: string,
  status: string,
  fineAmount: number
) => {
  const { data, error } = await supabase
    .from('student_dues')
    .update({ status: status as any, fine_amount: fineAmount } as any)
    .eq('id', duesModuleId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Could not update dues. Check permissions.");
  return data[0];
};

export const bulkProcessCollegeDues = async (pendingDues: { id: string, fine_amount: number }[], allDuesIds: string[]) => {
  // First, mark all dues as completed and fine = 0
  const noDuesIds = allDuesIds.filter(id => !pendingDues.find(p => p.id === id));
  
  if (noDuesIds.length > 0) {
    // Process in chunks if needed, but for typical college size <1000, in() works.
    const chunks = [];
    for (let i = 0; i < noDuesIds.length; i += 200) {
      chunks.push(noDuesIds.slice(i, i + 200));
    }
    for (const chunk of chunks) {
      const { error } = await supabase
        .from('student_dues')
        .update({ status: 'completed', fine_amount: 0 } as any)
        .in('id', chunk);
      if (error) throw error;
    }
  }

  // Next, update pending dues one by one (or bulk)
  for (const due of pendingDues) {
    const { error } = await supabase
      .from('student_dues')
      .update({ status: 'pending', fine_amount: due.fine_amount } as any)
      .eq('id', due.id);
    if (error) throw error;
  }
  
  return true;
};

export const getStaffStudentDues = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('student_dues')
    .select('*, profiles!inner(full_name, section, roll_number, department_id, email, semesters(name))')
    .eq('profiles.department_id', departmentId);

  if (error) throw error;
  return data;
};

export const getUnassignedSubjects = async () => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(*)')
    .is('teacher_id', null);
  if (error) throw error;
  return data;
};

export const assignTeacherToSubject = async (enrollmentId: string, teacherId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ teacher_id: teacherId } as any)
    .eq('id', enrollmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getAllFaculty = async (departmentId?: string) => {
  let query = supabase
    .from('profiles')
    .select('id, full_name, department_id')
    .in('role', ['faculty', 'teacher']);
    
  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const assignTeacherToSection = async (subjectId: string, section: string, teacherId: string, semesterId: string) => {
  const { data: students, error: studentError } = await supabase
    .from('profiles')
    .select('id')
    .eq('section', section)
    .eq('semester_id', semesterId);
    
  if (studentError) throw studentError;
  if (!students || students.length === 0) return [];
  
  const studentIds = students.map(s => s.id);
  
  const { data: existing } = await supabase
    .from('subject_enrollment')
    .select('id, student_id')
    .eq('subject_id', subjectId)
    .in('student_id', studentIds);
    
  const existingSet = new Set(existing?.map((e: any) => e.student_id));
  
  const newEnrollments = students
    .filter(s => !existingSet.has(s.id))
    .map(s => ({
       student_id: s.id,
       subject_id: subjectId,
       teacher_id: teacherId,
       status: 'pending' as any
    }));

  if (newEnrollments.length > 0) {
     const { error: insertErr } = await supabase.from('subject_enrollment').insert(newEnrollments as any);
     if (insertErr) throw insertErr;
  }

  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ teacher_id: teacherId } as any)
    .eq('subject_id', subjectId)
    .in('student_id', studentIds)
    .select();
    
  if (error) throw error;
  return data;
};

export const getAllDepartments = async () => {
  const { data, error } = await supabase.from('departments').select('*, profiles!departments_hod_id_fkey(full_name)');
  if (error) throw error;
  return data;
};

export const getUsersByRole = async (roles: string[]) => {
  const { data, error } = await supabase.from('profiles').select('*').in('role', roles);
  if (error) throw error;
  return data;
};

export const getUsersByDeptAndRoles = async (departmentId: string, roles: string[]) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('department_id', departmentId)
    .in('role', roles)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const updateSubjectAPI = async (id: string, updates: Record<string, any>) => {
  const { data, error } = await supabase
    .from('subjects')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateUserAPI = async (id: string, updates: Record<string, any>) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const adminUpdateUserCredentials = async (userId: string, email: string, password?: string) => {
  const { error } = await supabase.rpc('admin_update_user_credentials', {
    target_user_id: userId,
    new_email: email,
    new_password: password || null
  });
  if (error) throw error;
};

// =======================
// HOD SPECIFIC
// =======================
export const getHodPendingRequests = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('clearance_requests')
    .select('*, profiles!inner(full_name, department_id)')
    .eq('current_stage', 'hod_review')
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  return data;
};

export const getHodDepartmentStudents = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, semesters(name), clearance_requests(status, current_stage, created_at, updated_at)')
    .eq('department_id', departmentId)
    .eq('role', 'student')
    .order('full_name');
  if (error) throw error;
  return data;
};

export const approveHodRequest = async (requestId: string) => {
  const { data, error } = await supabase
    .from('clearance_requests')
    .update({ current_stage: 'cleared', status: 'completed' } as any)
    .eq('id', requestId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getHodStaffApprovedFines = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, section, department_id, roll_number), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
    .eq('remarks', 'Approved by Staff after Fine')
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  return data;
};

export const getHodTeacherAssignments = async (departmentId: string) => {
  // Get all teachers/faculty in the department
  const { data: teachers, error: tErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, section, email, created_at')
    .eq('department_id', departmentId)
    .in('role', ['teacher', 'faculty'])
    .order('full_name');
  if (tErr) throw tErr;

  // Get subject enrollment data for these teachers
  const teacherIds = (teachers || []).map(t => t.id);
  if (teacherIds.length === 0) return [];

  const { data: enrollments, error: eErr } = await supabase
    .from('subject_enrollment')
    .select('teacher_id, subject_id, subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code, semester_id, semesters(name)), profiles!subject_enrollment_student_id_fkey(section, semester_id)')
    .in('teacher_id', teacherIds);
  if (eErr) throw eErr;

  // Build a map: teacher_id -> { subjects, sections }
  const assignmentMap: Record<string, { subjects: Record<string, { subject_name: string; subject_code: string; semester: string; sections: Set<string> }> }> = {};

  for (const enrollment of (enrollments || [])) {
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

  // Merge teachers with their assignments
  return (teachers || []).map(teacher => ({
    ...teacher,
    assignments: assignmentMap[teacher.id]
      ? Object.values(assignmentMap[teacher.id].subjects).map(s => ({
          subject_name: s.subject_name,
          subject_code: s.subject_code,
          semester: s.semester,
          sections: Array.from(s.sections)
        }))
      : []
  }));
};

export const getAccountsApprovedDues = async () => {
  const { data, error } = await supabase
    .from('student_dues')
    .select('*, profiles!student_dues_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name))')
    .eq('status', 'completed');
  if (error) throw error;
  return data;
};

// =======================
// NOTIFICATIONS
// =======================
export const getUserNotifications = async (userId: string) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const markNotificationRead = async (notificationId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true } as any)
    .eq('id', notificationId);
  if (error) throw error;
};

// =======================
// SUBJECT MANAGEMENT (by department)
// =======================
export const getSubjectsByDepartment = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, departments(name), semesters(name)')
    .eq('department_id', departmentId)
    .order('subject_name');
  if (error) throw error;
  return data;
};

export const createSubject = async (subject: { subject_name: string; subject_code: string; department_id: string; semester_id: string }) => {
  const { data, error } = await supabase.from('subjects').insert(subject as any).select();
  if (error) throw error;
  return data;
};

export const deleteSubject = async (subjectId: string) => {
  const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
  if (error) throw error;
};

// =======================
// SECTION & USER HELPERS
// =======================
export const getDepartmentSections = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('section')
    .eq('department_id', departmentId)
    .eq('role', 'student')
    .not('section', 'is', null);
  if (error) throw error;
  // Return unique sections
  const sections = [...new Set((data || []).map((d: any) => d.section).filter(Boolean))];
  return sections as string[];
};

export const deleteUser = async (userId: string) => {
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) throw error;
};

export const getDepartmentById = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('id', departmentId)
    .single();
  if (error) throw error;
  return data;
};

// =======================
// ADMIN: ALL USERS & HALL-TICKET STATUS
// =======================
export const getAllUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, departments(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getAllStudentStatuses = async () => {
  const { data, error } = await supabase
    .from('clearance_requests')
    .select('*, profiles!clearance_requests_student_id_fkey(full_name, department_id, section, departments(name))');
  if (error) throw error;
  return data;
};

export const getStaffAttendanceFines = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, section, department_id), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
    .eq('status', 'rejected')
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  return data;
};

export const overrideAttendanceFine = async (enrollmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ status: 'completed', remarks: 'Approved by Staff after Fine' } as any)
    .eq('id', enrollmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// =======================
// SEMESTERS API
// =======================
export const createSemester = async (name: string, departmentId: string) => {
  const { data, error } = await supabase
    .from('semesters')
    .insert({ name, department_id: departmentId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getSemestersByDepartment = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('semesters')
    .select('*')
    .eq('department_id', departmentId)
    .order('name');
  if (error) throw error;
  return data;
};
