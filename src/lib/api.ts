import { supabase } from './supabase';

// =======================
// SYSTEM LOGS
// =======================
export const logActivity = async (action: string, details?: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('profiles').select('full_name, role, department_id').eq('id', user.id).single();

  await supabase.from('activity_logs').insert([{
    user_id: user.id,
    user_role: profile?.role,
    department_id: profile?.department_id,
    user_name: profile?.full_name,
    action,
    details
  } as any]);
};

export const getActivityLogs = async () => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

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
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name, section, semester_id, roll_number, semesters(name)), subjects(*)')
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
  const updatePayload: any = { status: status as any, attendance_pct: attendancePct, remarks };
  
  // If the faculty approves the subject, automatically wipe any assigned attendance fines
  if (status === 'completed') {
    updatePayload.attendance_fee = 0;
    updatePayload.attendance_fee_verified = false;
  }

  const { data, error } = await supabase
    .from('subject_enrollment')
    .update(updatePayload)
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name)')
    .single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  logActivity(status === 'completed' ? 'Cleared Subject' : 'Rejected Subject', `Marked attendance ${attendancePct}% for ${studentName}`);
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
        .update({ status: 'completed' } as any)
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
  
  // Log the mass upload
  await logActivity('Uploaded CSV for Dues', `Set ${pendingDues.length} students as pending, ${noDuesIds.length} marked completed.`);
  
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
  const { data: tProfile } = await supabase.from('profiles').select('full_name').eq('id', teacherId).single();
  const { data: sInfo } = await supabase.from('subjects').select('subject_name').eq('id', subjectId).single();
  logActivity('Assigned Teacher', `Assigned ${tProfile?.full_name || 'teacher'} to section ${section} for ${sInfo?.subject_name || 'subject'}`);
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
    .select('*, semesters(name)')
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
    .select('*, profiles!clearance_requests_student_id_fkey(full_name)')
    .single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  logActivity('Approved HOD Clearance', `Final clearance approved for: ${studentName}`);
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
  // Get all teachers/faculty in the department (exclude FYC-managed teachers)
  const { data: teachers, error: tErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, section, email, created_at')
    .eq('department_id', departmentId)
    .in('role', ['teacher', 'faculty'])
    .is('created_by', null)
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

// =======================
// HOD SPECIFIC
// =======================
export const getHodStaffActivityLogs = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('department_id', departmentId)
    .neq('user_role', 'student')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
};

export const getFycStaffActivityLogs = async () => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .neq('user_role', 'fyc')
    // We fetch logs where user_id matches FYC themselves, OR users they created.
    // The RLS policy will automatically handle the permission.
    // To simplify the query, we can fetch all logs that RLS permits, but we should sort and limit.
    // We don't have created_by in activity_logs, so we rely on RLS returning the right set.
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
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
  const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId });
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
    .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, roll_number, section, department_id, semester_id, semesters(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
    .eq('status', 'rejected')
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  return data;
};

export const overrideAttendanceFine = async (enrollmentId: string, feeAmount: number = 0) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ status: 'completed', remarks: 'Approved by Staff after Fine', attendance_fee: feeAmount } as any)
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name)')
    .single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  logActivity('Staff Approved Fine', `Override and cleared attendance for ${studentName} with fee: ₹${feeAmount}`);
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

// =======================
// STAFF: PAID AMOUNT
// =======================
export const updateStudentPaidAmount = async (dueId: string, paidAmount: number) => {
  const { data, error } = await supabase
    .from('student_dues')
    .update({ paid_amount: paidAmount, updated_at: new Date().toISOString() } as any)
    .eq('id', dueId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// =======================
// ACCOUNTS: MANUAL FEE ENTRY
// =======================
export const updateStudentDueFee = async (dueId: string, fineAmount: number, paidAmount: number = 0) => {
  const status = fineAmount > 0 && fineAmount > paidAmount ? 'pending' : 'completed';
  const { error } = await supabase
    .from('student_dues')
    .update({ fine_amount: fineAmount, paid_amount: paidAmount, status, updated_at: new Date().toISOString() } as any)
    .eq('id', dueId);
  if (error) throw error;
  return { id: dueId, fine_amount: fineAmount, paid_amount: paidAmount, status };
};

// =======================
// SEMESTER PROMOTION
// =======================
export const promoteStudents = async (sourceSemesterId: string, targetSemesterId: string, departmentId: string) => {
  const { data, error } = await supabase.rpc('promote_students_to_semester', {
    p_source_semester_id: sourceSemesterId,
    p_target_semester_id: targetSemesterId,
    p_department_id: departmentId,
  });
  if (error) throw error;
  return data as number;
};

// =======================
// IA ATTENDANCE
// =======================

/** Get distinct subjects a teacher is assigned to (from subject_enrollment) */
export const getTeacherSubjectsList = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('subject_id, subjects!subject_enrollment_subject_id_fkey(id, subject_name, subject_code, semester_id, semesters(name))')
    .eq('teacher_id', teacherId);
  if (error) throw error;

  // Deduplicate by subject_id
  const subjectMap = new Map();
  (data || []).forEach((row: any) => {
    if (row.subjects && !subjectMap.has(row.subject_id)) {
      subjectMap.set(row.subject_id, row.subjects);
    }
  });
  return Array.from(subjectMap.values());
};

/** Get the current max IA number for a subject taught by a teacher */
export const getIACountForSubject = async (subjectId: string, teacherId: string) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('ia_number')
    .eq('subject_id', subjectId)
    .eq('teacher_id', teacherId)
    .order('ia_number', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0].ia_number : 0;
};

/** Get all students enrolled in a subject under a specific teacher */
export const getStudentsForSubject = async (subjectId: string, teacherId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('student_id, profiles!subject_enrollment_student_id_fkey(id, full_name, roll_number, section, semester_id)')
    .eq('subject_id', subjectId)
    .eq('teacher_id', teacherId);
  if (error) throw error;
  return data;
};

/** Bulk upsert IA attendance records for a specific IA */
export const saveIAAttendance = async (
  records: { student_id: string; subject_id: string; teacher_id: string; ia_number: number; is_present: boolean }[]
) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .upsert(records as any, { onConflict: 'student_id,subject_id,ia_number' })
    .select();
  if (error) throw error;
  logActivity('Saved IA Attendance', `Updated IA metrics for ${records.length} students`);
  return data;
};

/** Get all IA attendance records for a subject+teacher */
export const getIAAttendanceForSubject = async (subjectId: string, teacherId: string) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('*, profiles!ia_attendance_student_id_fkey(full_name, roll_number, section)')
    .eq('subject_id', subjectId)
    .eq('teacher_id', teacherId)
    .order('ia_number')
    .order('created_at');
  if (error) throw error;
  return data;
};

/** Get all IA attendance records across all subjects for a specific teacher */
export const getTeacherIAAttendance = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('student_id, subject_id, is_present')
    .eq('teacher_id', teacherId);
  if (error) throw error;
  return data;
};

/** Get all IA attendance records for a student (across all subjects) */
export const getStudentIAAttendance = async (studentId: string) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('*, subjects!ia_attendance_subject_id_fkey(subject_name, subject_code)')
    .eq('student_id', studentId)
    .order('subject_id')
    .order('ia_number');
  if (error) throw error;
  return data;
};

// =======================
// ACCOUNTS: ATTENDANCE FEE VERIFICATION
// =======================

/** Get all subject_enrollment records with attendance_fee > 0 that need verification */
export const getAccountsPendingFeeVerifications = async () => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
    .gt('attendance_fee', 0)
    .eq('attendance_fee_verified', false);
  if (error) throw error;
  return data;
};

/** Verify an attendance fee payment (accounts confirms) */
export const verifyAttendanceFee = async (enrollmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ attendance_fee_verified: true } as any)
    .eq('id', enrollmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

/** Get all verified attendance fees (for accounts history) */
export const getAccountsVerifiedFees = async () => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
    .gt('attendance_fee', 0)
    .eq('attendance_fee_verified', true);
  if (error) throw error;
  return data;
};

// =======================
// RAZORPAY INTEGRATION
// =======================

export const createRazorpayOrder = async (amount: number, enrollmentId: string) => {
  const response = await fetch('/api/create-razorpay-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, receipt: enrollmentId }),
  });
  const data = await response.json();
  if (!response.ok || data?.error) throw new Error(data?.error || 'Failed to create order');
  return data;
};

export const verifyAndProcessRazorpayPayment = async (
  enrollmentId: string, 
  razorpay_order_id: string, 
  razorpay_payment_id: string, 
  razorpay_signature: string
) => {
  const response = await fetch('/api/verify-razorpay-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  });
  const verification = await response.json();
  if (!response.ok || !verification?.verified) throw new Error(verification?.error || 'Payment verification failed');

  // If verified, update the subject_enrollment
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ 
      attendance_fee_verified: true, 
      status: 'completed', 
      remarks: 'Cleared via Online Payment',
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_date: new Date().toISOString()
    } as any)
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name)')
    .single();

  if (error) throw error;
  
  const studentName = data?.profiles?.full_name || 'student';
  logActivity('Attendance Due Paid', `${studentName} paid fine via Razorpay (ID: ${razorpay_payment_id})`);
  
  return data;
};

export const setAttendanceDue = async (studentId: string, subjectId: string, feeAmount: number) => {
  const { data: existing } = await supabase
    .from('subject_enrollment')
    .select('id')
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
    .single();
    
  if (existing) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .update({ attendance_fee: feeAmount, attendance_fee_verified: false, status: 'rejected' } as any)
      .eq('id', existing.id)
      .select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(subject_name)')
      .single();
    if (error) throw error;
    
    const studentName = data?.profiles?.full_name || 'student';
    const subjName = (data as any)?.subjects?.subject_name || 'subject';
    logActivity('Assigned Attendance Due', `Staff set ₹${feeAmount} fine for ${studentName} in ${subjName}`);
    return data;
  } else {
    throw new Error("Student is not enrolled in this subject.");
  }
};

export const getStudentByUSN = async (usn: string, departmentId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, roll_number')
    .eq('roll_number', usn.toUpperCase())
    .eq('department_id', departmentId)
    .single();
  if (error) throw new Error("Student not found in your department.");
  
  const { data: subjects, error: subjErr } = await supabase
    .from('subject_enrollment')
    .select('subject_id, subjects(subject_name, subject_code)')
    .eq('student_id', data.id);
  if (subjErr) throw subjErr;
    
  return { student: data, subjects: subjects || [] };
};

export const bulkSetAttendanceDuesCSV = async (departmentId: string | undefined, rows: { roll_number: string; subject_code: string; amount: number }[]) => {
  const rollNumbers = rows.map(r => r.roll_number.trim().toUpperCase());
  
  let query = supabase.from('profiles').select('id, roll_number').eq('role', 'student').in('roll_number', rollNumbers);
  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }
  
  const { data: students, error: studentError } = await query;
  if (studentError) throw studentError;
  if (!students || students.length === 0) throw new Error('No matching students found.');

  const studentMap = new Map(students.map(s => [s.roll_number?.toUpperCase(), s.id]));
  
  // Get all subjects
  const { data: allSubjects, error: subErr } = await supabase.from('subjects').select('id, subject_code');
  if (subErr) throw subErr;
  const subjectMap = new Map(allSubjects.map(s => [s.subject_code?.toUpperCase(), s.id]));

  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const studentId = studentMap.get(row.roll_number.trim().toUpperCase());
    const subjectId = subjectMap.get(row.subject_code.trim().toUpperCase());
    
    if (!studentId) {
      errors.push(`USN ${row.roll_number} not found`);
      continue;
    }
    if (!subjectId) {
      errors.push(`Subject ${row.subject_code} not found`);
      continue;
    }

    try {
      const { data: existing } = await supabase
        .from('subject_enrollment')
        .select('id')
        .eq('student_id', studentId)
        .eq('subject_id', subjectId)
        .single();
        
      if (existing) {
        await supabase
          .from('subject_enrollment')
          .update({ attendance_fee: row.amount, attendance_fee_verified: false, status: 'rejected' } as any)
          .eq('id', existing.id);
        updated++;
      } else {
        errors.push(`USN ${row.roll_number} not enrolled in ${row.subject_code}`);
      }
    } catch (err: any) {
      errors.push(`USN ${row.roll_number}: ${err.message}`);
    }
  }

  if (updated > 0) logActivity('Bulk Attendance Dues', `Assigned attendance fines for ${updated} students.`);
  return { updated, errors };
};

// =======================
// ATTENDANCE FINE CATEGORIES
// =======================

/** Get all attendance fine categories for a department */
export const getAttendanceCategories = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('attendance_fine_categories')
    .select('*')
    .eq('department_id', departmentId)
    .order('min_pct', { ascending: false });
  if (error) throw error;
  return data || [];
};

/** Create a new attendance fine category */
export const createAttendanceCategory = async (departmentId: string, label: string, minPct: number, maxPct: number, amount: number) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('attendance_fine_categories')
    .insert([{ department_id: departmentId, label, min_pct: minPct, max_pct: maxPct, fine_amount: amount, created_by: user?.id }] as any)
    .select()
    .single();
  if (error) throw error;
  logActivity('Created Fine Category', `${label}: ${minPct}%-${maxPct}% → ₹${amount}`);
  return data;
};

/** Update an attendance fine category */
export const updateAttendanceCategory = async (id: string, label: string, minPct: number, maxPct: number, amount: number) => {
  const { data, error } = await supabase
    .from('attendance_fine_categories')
    .update({ label, min_pct: minPct, max_pct: maxPct, fine_amount: amount, updated_at: new Date().toISOString() } as any)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  logActivity('Updated Fine Category', `${label}: ${minPct}%-${maxPct}% → ₹${amount}`);
  return data;
};

/** Delete an attendance fine category */
export const deleteAttendanceCategory = async (id: string) => {
  const { error } = await supabase
    .from('attendance_fine_categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
  logActivity('Deleted Fine Category', `Removed category ${id}`);
};

/** Apply mass fines: match attendance_pct against categories, set attendance_fee on rejected enrollments */
export const applyMassFines = async (departmentId: string, isFirstYear: boolean) => {
  // 1. Get categories for this department
  const categories = await getAttendanceCategories(departmentId);
  if (categories.length === 0) throw new Error('No attendance fine categories configured. Please create categories first.');

  // 2. Get all rejected enrollments for this department
  const fines = await getStaffAttendanceFines(departmentId);
  
  // 3. Filter by first year or not
  const isFirstYearSem = (name: string) => {
    const n = name.toLowerCase();
    return n.includes('1st') || n.includes('2nd') || n === '1' || n === '2' || n.includes('first') || n.includes('second');
  };
  const filtered = (fines || []).filter((item: any) => {
    const semName = item.profiles?.semesters?.name || '';
    return isFirstYear ? isFirstYearSem(semName) : !isFirstYearSem(semName);
  });

  let updated = 0;
  let skipped = 0;

  for (const enrollment of filtered) {
    const pct = enrollment.attendance_pct || 0;
    
    // Already has a fee assigned and verified — skip
    if (enrollment.attendance_fee > 0 && enrollment.attendance_fee_verified) {
      skipped++;
      continue;
    }
    
    // Find matching category
    const match = categories.find((c: any) => pct >= c.min_pct && pct <= c.max_pct);
    if (!match) {
      skipped++;
      continue;
    }

    const newFee = Number(match.fine_amount);
    // Skip if same fine already applied
    if (enrollment.attendance_fee === newFee) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('subject_enrollment')
      .update({ attendance_fee: newFee, attendance_fee_verified: false } as any)
      .eq('id', enrollment.id);
    
    if (!error) updated++;
  }

  logActivity('Applied Mass Fines', `Auto-assigned fines to ${updated} students (${skipped} skipped) based on ${categories.length} categories.`);
  return { updated, skipped, total: filtered.length };
};

/** Reduce (modify) a specific student's attendance fine */
export const reduceStudentFine = async (enrollmentId: string, newAmount: number) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ attendance_fee: newAmount, attendance_fee_verified: false } as any)
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(subject_name)')
    .single();
  if (error) throw error;
  
  const studentName = data?.profiles?.full_name || 'student';
  const subjName = (data as any)?.subjects?.subject_name || 'subject';
  logActivity('Reduced Fine', `Set fine to ₹${newAmount} for ${studentName} in ${subjName}`);
  return data;
};

/** Manually clear an attendance fine (mark as paid via cash) */
export const clearStudentFine = async (enrollmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ attendance_fee_verified: true, status: 'completed' } as any)
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(subject_name)')
    .single();
    
  if (error) throw error;
  
  const studentName = data?.profiles?.full_name || 'student';
  const subjName = (data as any)?.subjects?.subject_name || 'subject';
  logActivity('Cleared Fine', `Manually cleared fine (cash payment) for ${studentName} in ${subjName}`);
  return data;
};

/** Create a bulk Razorpay order for Pay All (total of multiple enrollments) */
export const createBulkRazorpayOrder = async (totalAmount: number, enrollmentIds: string[]) => {
  const response = await fetch('/api/create-razorpay-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: totalAmount, receipt: `bulk_${enrollmentIds.length}_${Date.now()}` }),
  });
  const data = await response.json();
  if (!response.ok || data?.error) throw new Error(data?.error || 'Failed to create bulk order');
  return data;
};

/** Verify bulk Razorpay payment and mark ALL enrollments as paid */
export const verifyAndProcessBulkRazorpayPayment = async (
  enrollmentIds: string[],
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string
) => {
  // 1. Verify signature
  const response = await fetch('/api/verify-razorpay-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  });
  const verification = await response.json();
  if (!response.ok || !verification?.verified) throw new Error(verification?.error || 'Payment verification failed');

  // 2. Update all enrollments
  const results = [];
  for (const eid of enrollmentIds) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .update({
        attendance_fee_verified: true,
        status: 'completed',
        remarks: 'Cleared via Online Payment (Bulk)',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        payment_date: new Date().toISOString()
      } as any)
      .eq('id', eid)
      .select('*, subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
      .single();
    if (!error && data) results.push(data);
  }

  logActivity('Bulk Attendance Payment', `Paid fines for ${results.length} subjects via Razorpay (ID: ${razorpay_payment_id})`);
  return results;
};

/** Get all fines for HOD tracking (both paid and unpaid) */
export const getHodFinePayments = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, section, department_id, roll_number, semester_id, semesters!profiles_semester_id_fkey(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
    .gt('attendance_fee', 0)
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  return data;
};

// =======================
// LIBRARY DUES MANAGEMENT
// =======================

/** Get all library dues */
export const getLibraryDues = async () => {
  const { data, error } = await supabase
    .from('library_dues')
    .select('*, profiles!library_dues_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name))');
  if (error) throw error;
  return data;
};

/** Get library dues for a specific student */
export const getStudentLibraryDues = async (studentId: string) => {
  const { data, error } = await supabase
    .from('library_dues')
    .select('*')
    .eq('student_id', studentId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // ignore no rows
  return data;
};

/** Update a single student's library due status */
export const updateLibraryDue = async (studentId: string, hasDues: boolean, fineAmount: number, paidAmount: number = 0, remarks: string) => {
  const { data, error } = await supabase
    .from('library_dues')
    .upsert(
      { student_id: studentId, has_dues: hasDues, fine_amount: fineAmount, paid_amount: paidAmount, remarks },
      { onConflict: 'student_id' }
    )
    .select('*, profiles!library_dues_student_id_fkey(full_name)')
    .single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  logActivity(hasDues ? 'Assigned Library Fine' : 'Cleared Library Fine', `Amount: ₹${fineAmount} for ${studentName}`);
  return data;
};

/** Bulk process library dues from CSV — only USNs of not-paid students. Everyone else is auto-cleared. */
export const bulkProcessLibraryDues = async (notPaidRolls: string[]) => {
  const upperRolls = notPaidRolls.map(r => r.trim().toUpperCase());

  // Get all library dues with their student roll numbers
  const { data: allDues, error: duesError } = await supabase
    .from('library_dues')
    .select('id, student_id, profiles!library_dues_student_id_fkey(roll_number)');
  if (duesError) throw duesError;

  const notPaidIds: string[] = [];
  const clearedIds: string[] = [];

  for (const due of (allDues || [])) {
    const roll = (due as any).profiles?.roll_number?.toUpperCase();
    if (roll && upperRolls.includes(roll)) {
      notPaidIds.push(due.id);
    } else {
      clearedIds.push(due.id);
    }
  }

  // Mark not-paid students as having dues
  if (notPaidIds.length > 0) {
    for (let i = 0; i < notPaidIds.length; i += 200) {
      const chunk = notPaidIds.slice(i, i + 200);
      const { error } = await supabase
        .from('library_dues')
        .update({ has_dues: true, remarks: 'Not paid — bulk upload' } as any)
        .in('id', chunk);
      if (error) throw error;
    }
  }

  // Auto-clear all other students
  if (clearedIds.length > 0) {
    for (let i = 0; i < clearedIds.length; i += 200) {
      const chunk = clearedIds.slice(i, i + 200);
      const { error } = await supabase
        .from('library_dues')
        .update({ has_dues: false, fine_amount: 0, remarks: 'Cleared — not in upload list' } as any)
        .in('id', chunk);
      if (error) throw error;
    }
  }

  logActivity('Bulk Processed Library Dues', `${notPaidIds.length} not paid, ${clearedIds.length} auto-cleared`);

  return notPaidIds.length;
};

// =======================
// STUDENT PROMOTION SYSTEM
// =======================

/** Export all pre-promotion data for CSV download */
export const getPrePromotionData = async () => {
  const { data, error } = await supabase.rpc('export_pre_promotion_data');
  if (error) throw error;
  return data;
};

/** Promote all students across all departments */
export const promoteAllStudents = async () => {
  const { data, error } = await supabase.rpc('promote_all_students');
  if (error) throw error;
  logActivity('Promoted All Students', `Mass promotion completed: ${JSON.stringify(data)}`);
  return data;
};

/** Get semester distribution for promotion preview */
export const getPromotionPreview = async () => {
  // Get all active students grouped by department and semester
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, department_id, semester_id, section, departments!profiles_department_id_fkey(name), semesters!profiles_semester_id_fkey(name)')
    .eq('role', 'student')
    .or('status.is.null,status.eq.active')
    .order('full_name');
  if (error) throw error;
  return data;
};

/** Get all graduated students grouped by department and batch */
export const getGraduatedStudents = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, roll_number, department_id, batch, section, created_at, departments!profiles_department_id_fkey(name)')
    .eq('role', 'student')
    .eq('status', 'graduated')
    .order('full_name');
  if (error) throw error;
  return data;
};

/** Get all active students with details */
export const getActiveStudentsDetails = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, roll_number, department_id, section, created_at, semesters!profiles_semester_id_fkey(name), departments!profiles_department_id_fkey(name)')
    .eq('role', 'student')
    .or('status.is.null,status.eq.active')
    .order('full_name');
  if (error) throw error;
  return data;
};

/** Remove graduated students permanently */
export const removeGraduatedStudents = async (studentIds: string[]) => {
  if (studentIds.length === 0) return 0;

  // Process in chunks of 200
  for (let i = 0; i < studentIds.length; i += 200) {
    const chunk = studentIds.slice(i, i + 200);
    const { error } = await supabase.from('profiles').delete().in('id', chunk);
    if (error) throw error;
  }

  logActivity('Removed Graduated Students', `Permanently removed ${studentIds.length} graduated students`);
  return studentIds.length;
};

/** Get students needing section assignment (3rd sem, no section) */
export const getStudentsNeedingSections = async (departmentId: string) => {
  const { data: semesters, error: semErr } = await supabase
    .from('semesters')
    .select('id')
    .eq('department_id', departmentId)
    .eq('name', '3');
  if (semErr) throw semErr;
  if (!semesters || semesters.length === 0) return [];

  const semId = semesters[0].id;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, roll_number, section, semester_id, semesters!profiles_semester_id_fkey(name)')
    .eq('department_id', departmentId)
    .eq('semester_id', semId)
    .eq('role', 'student')
    .is('section', null)
    .order('full_name');
  if (error) throw error;
  return data;
};

/** Bulk assign sections to students */
export const bulkAssignSections = async (assignments: { student_id: string; section: string }[]) => {
  let updated = 0;
  for (const a of assignments) {
    const { error } = await supabase
      .from('profiles')
      .update({ section: a.section.toUpperCase() } as any)
      .eq('id', a.student_id);
    if (error) throw error;
    updated++;
  }
  logActivity('Bulk Assigned Sections', `Assigned sections to ${updated} students`);
  return updated;
};

/** Bulk assign sections via CSV (matching by roll_number/USN) */
export const bulkAssignSectionsCSV = async (departmentId: string, rows: { roll_number: string; section: string }[]) => {
  const rollNumbers = rows.map(r => r.roll_number.trim().toUpperCase());

  const { data: students, error: studentError } = await supabase
    .from('profiles')
    .select('id, roll_number')
    .eq('role', 'student')
    .eq('department_id', departmentId)
    .in('roll_number', rollNumbers);

  if (studentError) throw studentError;
  if (!students || students.length === 0) {
    throw new Error('No matching students found for the provided USNs.');
  }

  const studentMap = new Map(students.map(s => [s.roll_number?.toUpperCase(), s.id]));
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const studentId = studentMap.get(row.roll_number.trim().toUpperCase());
    if (!studentId) {
      errors.push(`USN "${row.roll_number}" not found`);
      continue;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ section: row.section.trim().toUpperCase() } as any)
      .eq('id', studentId);

    if (error) {
      errors.push(`USN "${row.roll_number}": ${error.message}`);
    } else {
      updated++;
    }
  }

  logActivity('CSV Section Assignment', `Assigned sections to ${updated}/${rows.length} students in department`);
  return { updated, errors };
};

/** Get all unique sections in a department for a specific semester */
export const getSectionsForSemester = async (departmentId: string, semesterId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('section')
    .eq('department_id', departmentId)
    .eq('semester_id', semesterId)
    .eq('role', 'student')
    .not('section', 'is', null);
  if (error) throw error;
  const sections = [...new Set((data || []).map((d: any) => d.section).filter(Boolean))];
  return sections.sort() as string[];
};

/** Update a student's section */
export const updateStudentSection = async (studentId: string, section: string | null) => {
  const { error } = await supabase
    .from('profiles')
    .update({ section: section ? section.toUpperCase() : null } as any)
    .eq('id', studentId);
  if (error) throw error;
  logActivity('Updated Section', `Updated section for student to ${section || 'None'}`);
};

/** Remove section from all students in a specific section/semester */
export const deleteSection = async (departmentId: string, semesterId: string, sectionName: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ section: null } as any)
    .eq('department_id', departmentId)
    .eq('semester_id', semesterId)
    .eq('section', sectionName)
    .eq('role', 'student')
    .select('id');
  if (error) throw error;
  logActivity('Deleted Section', `Removed section "${sectionName}" from ${data?.length || 0} students`);
  return data?.length || 0;
};
