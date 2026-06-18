import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// HOD SPECIFIC
// =======================
export const getHodPendingRequests = async (departmentId: string) => {
  // 1. Get all non-cleared clearance requests for this department
  // Include 'rejected' so HOD can override if student has since cleared all prerequisites
  const { data: requests, error } = await supabase
    .from('clearance_requests')
    .select('*, profiles!inner(id, full_name, department_id, roll_number, section, semester_id, semesters(name))')
    .in('current_stage', ['faculty_review', 'library_review', 'department_review', 'hod_review', 'rejected'])
    .neq('status', 'completed')
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  // 2. Get student IDs
  const studentIds = requests.map((r: any) => r.student_id);

  // Helper: chunk array into batches of N (Supabase .in() has ~100 element limit)
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };
  const CHUNK_SIZE = 80; // Stay well under 100 limit
  const idChunks = chunk(studentIds, CHUNK_SIZE);

  // 3. Fetch enrollments for all students (chunked for safety)
  const allEnrollments: any[] = [];
  for (const ids of idChunks) {
    const { data } = await supabase
      .from('subject_enrollment')
      .select('student_id, status, attendance_fee_verified')
      .in('student_id', ids);
    if (data) allEnrollments.push(...data);
  }

  // 4. Fetch library dues for all students (chunked)
  const allLibraryDues: any[] = [];
  for (const ids of idChunks) {
    const { data } = await supabase
      .from('library_dues')
      .select('student_id, has_dues, permitted')
      .in('student_id', ids);
    if (data) allLibraryDues.push(...data);
  }

  // 5. Fetch college dues for all students (chunked)
  const allCollegeDues: any[] = [];
  for (const ids of idChunks) {
    const { data } = await supabase
      .from('student_dues')
      .select('student_id, status, permitted_until')
      .in('student_id', ids);
    if (data) allCollegeDues.push(...data);
  }

  // 6. Build eligibility map
  const enrollmentsByStudent = allEnrollments.reduce((acc: any, e: any) => {
    if (!acc[e.student_id]) acc[e.student_id] = [];
    acc[e.student_id].push(e);
    return acc;
  }, {} as Record<string, any[]>);

  const libraryByStudent = allLibraryDues.reduce((acc: any, l: any) => {
    acc[l.student_id] = l;
    return acc;
  }, {} as Record<string, any>);

  const duesByStudent = allCollegeDues.reduce((acc: any, d: any) => {
    if (!acc[d.student_id]) acc[d.student_id] = [];
    acc[d.student_id].push(d);
    return acc;
  }, {} as Record<string, any[]>);

  // 7. Filter: only students with ALL prerequisites cleared/permitted
  return requests.filter((req: any) => {
    const sid = req.student_id;

    // Faculty clearance: every enrollment is completed OR fee verified
    const enrs = enrollmentsByStudent[sid] || [];
    const facultyCleared = enrs.length > 0 && enrs.every(
      (e: any) => e.status === 'completed' || e.attendance_fee_verified === true
    );

    // Library clearance: no dues OR permitted
    // If no library_dues record exists, treat as NOT cleared (librarian hasn't processed yet)
    const lib = libraryByStudent[sid];
    const libraryPass = lib ? (!lib.has_dues || lib.permitted) : false;

    // College dues: all completed OR permitted
    const dues = duesByStudent[sid] || [];
    const duesPass = dues.length === 0 || dues.every(
      (d: any) => d.status === 'completed' || (d.permitted_until && new Date(d.permitted_until) > new Date())
    );

    return facultyCleared && libraryPass && duesPass;
  });
};

export const getHodDepartmentStudents = async (departmentId: string) => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, semesters(name), clearance_requests(status, current_stage, created_at, updated_at)')
      .eq('department_id', departmentId)
      .eq('role', 'student')
      .order('roll_number')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
};

export const approveHodRequest = async (requestId: string) => {
  const { data, error } = await supabase
    .from('clearance_requests')
    .update({ current_stage: 'cleared', status: 'completed' })
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
  const { data: nativeTeachers, error: tErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, section, email, created_at')
    .eq('department_id', departmentId)
    .in('role', ['teacher', 'faculty'])
    .order('full_name');
  if (tErr) throw tErr;

  const { data: importedData } = await supabase
    .from('imported_teachers')
    .select('teacher_id, profiles!inner(id, full_name, role, section, email, created_at)')
    .eq('department_id', departmentId);

  const importedTeachers = (importedData || []).map((imp: any) => imp.profiles).filter(Boolean);
  const allTeachers = [...(nativeTeachers || []), ...importedTeachers];
  const uniqueMap = new Map();
  allTeachers.forEach(t => uniqueMap.set(t.id, t));
  const teachers = Array.from(uniqueMap.values());

  const teacherIds = teachers.map(t => t.id);
  if (teacherIds.length === 0) return [];

  // Paginated fetch to avoid Supabase 1000-row default limit
  let allEnrollments: any[] = [];
  let from = 0;
  while (true) {
    const { data: batch, error: eErr } = await supabase
      .from('subject_enrollment')
      .select('teacher_id, subject_id, subjects(subject_name, subject_code, semester_id, semesters(name)), profiles!subject_enrollment_student_id_fkey(section, semester_id)')
      .in('teacher_id', teacherIds)
      .range(from, from + 999);
    if (eErr) throw eErr;
    if (!batch || batch.length === 0) break;
    allEnrollments = allEnrollments.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }

  const assignmentMap: Record<string, { subjects: Record<string, { subject_name: string; subject_code: string; semester: string; sections: Set<string> }> }> = {};

  for (const enrollment of allEnrollments) {
    const tid = enrollment.teacher_id;
    if (!tid) continue;
    if (!assignmentMap[tid]) assignmentMap[tid] = { subjects: {} };

    const subj = (enrollment as any).subjects;
    const studentProfile = (enrollment as any).profiles;
    const semesterId = subj?.semester_id || studentProfile?.semester_id || '';
    // Use composite key to differentiate same subject across semesters
    const subjectKey = `${enrollment.subject_id}__${semesterId}`;
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

  return teachers.map(teacher => ({
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

export const getHodStaffActivityLogs = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('department_id', departmentId)
    .neq('user_role', 'student')
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) throw error;
  return data;
};

export const getFycStaffActivityLogs = async () => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .neq('user_role', 'fyc')
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) throw error;
  return data;
};

export const getHodFinePayments = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, section, department_id, roll_number, semester_id, semesters!profiles_semester_id_fkey(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
    .gt('attendance_fee', 0)
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  return data;
};
