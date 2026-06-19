import { supabase } from '../supabase';
import { logActivity, isFirstYearSem } from './shared';


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
      .select('student_id, status, attendance_fee, attendance_fee_verified')
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

    // Faculty clearance: MUST match student dashboard logic exactly:
    //   (status='completed' OR fee_verified) AND (no fee OR fee_verified)
    // A student with status='completed' but an unpaid attendance fine is NOT cleared.
    const enrs = enrollmentsByStudent[sid] || [];
    const facultyCleared = enrs.length > 0 && enrs.every(
      (e: any) =>
        (e.status === 'completed' || e.attendance_fee_verified === true) &&
        ((e.attendance_fee ?? 0) === 0 || e.attendance_fee_verified === true)
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

/**
 * FYC Clearances: same prerequisite gates as HOD but scoped to First-Year students only.
 * A student appears ONLY when faculty + library + accounts are all cleared/permitted.
 */
export const getFycPendingRequests = async () => {
  // 1. Get FY semester IDs first (so we can server-side filter profiles)
  const { data: allSems } = await supabase.from('semesters').select('id, name');
  const fySemIds = (allSems || []).filter((s: any) => isFirstYearSem(s.name)).map((s: any) => s.id);
  if (fySemIds.length === 0) return [];

  // 2. Get all non-cleared clearance requests for first-year students
  const { data: requests, error } = await supabase
    .from('clearance_requests')
    .select('*, profiles!inner(id, full_name, department_id, roll_number, section, semester_id, semesters(name), departments!profiles_department_id_fkey(name))')
    .in('current_stage', ['faculty_review', 'library_review', 'department_review', 'hod_review', 'rejected'])
    .neq('status', 'completed')
    .in('profiles.semester_id', fySemIds);
  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  const studentIds = requests.map((r: any) => r.student_id);

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  };
  const CHUNK_SIZE = 80;
  const idChunks = chunk(studentIds, CHUNK_SIZE);

  // 3. Fetch enrollments (faculty check)
  const allEnrollments: any[] = [];
  for (const ids of idChunks) {
    const { data } = await supabase
      .from('subject_enrollment')
      .select('student_id, status, attendance_fee, attendance_fee_verified')
      .in('student_id', ids);
    if (data) allEnrollments.push(...data);
  }

  // 4. Fetch library dues
  const allLibraryDues: any[] = [];
  for (const ids of idChunks) {
    const { data } = await supabase
      .from('library_dues')
      .select('student_id, has_dues, permitted')
      .in('student_id', ids);
    if (data) allLibraryDues.push(...data);
  }

  // 5. Fetch college/accounts dues
  const allCollegeDues: any[] = [];
  for (const ids of idChunks) {
    const { data } = await supabase
      .from('student_dues')
      .select('student_id, status, permitted_until')
      .in('student_id', ids);
    if (data) allCollegeDues.push(...data);
  }

  // 6. Build eligibility maps
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

  // 7. Return ONLY students where ALL three pipelines are cleared
  return requests.filter((req: any) => {
    const sid = req.student_id;

    // Faculty clearance: MUST match student dashboard logic exactly:
    //   (status='completed' OR fee_verified) AND (no fee OR fee_verified)
    // A student with status='completed' but an unpaid attendance fine is NOT cleared.
    const enrs = enrollmentsByStudent[sid] || [];
    const facultyCleared = enrs.length > 0 && enrs.every(
      (e: any) =>
        (e.status === 'completed' || e.attendance_fee_verified === true) &&
        ((e.attendance_fee ?? 0) === 0 || e.attendance_fee_verified === true)
    );

    // Library: record must exist AND (no dues OR explicitly permitted)
    const lib = libraryByStudent[sid];
    const libraryPass = lib ? (!lib.has_dues || lib.permitted) : false;

    // Accounts/College dues: all completed OR within permitted window
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

  // ── Allowed semester IDs: HOD's own department + any first-year semester ──
  const { data: allSemesters } = await supabase
    .from('semesters')
    .select('id, name, department_id');

  const allowedSemIds = new Set(
    (allSemesters || [])
      .filter((s: any) => s.department_id === departmentId || isFirstYearSem(s.name))
      .map((s: any) => s.id)
  );

  // ── Paginated enrollment fetch (includes attendance_pct for count) ──
  let allEnrollments: any[] = [];
  let from = 0;
  while (true) {
    const { data: batch, error: eErr } = await supabase
      .from('subject_enrollment')
      .select('teacher_id, subject_id, attendance_pct, subjects(subject_name, subject_code, semester_id, semesters(name)), profiles!subject_enrollment_student_id_fkey(section, semester_id)')
      .in('teacher_id', teacherIds)
      .range(from, from + 999);
    if (eErr) throw eErr;
    if (!batch || batch.length === 0) break;
    allEnrollments = allEnrollments.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }

  // ── Filter: only enrollments where student's semester belongs to HOD's scope ──
  const scopedEnrollments = allEnrollments.filter((e: any) => {
    const studentSemId = e.profiles?.semester_id;
    return studentSemId && allowedSemIds.has(studentSemId);
  });

  type SubjectEntry = {
    subject_name: string;
    subject_code: string;
    semester: string;
    sections: Set<string>;
    attendanceBySec: Record<string, { total: number; filled: number }>;
  };

  const assignmentMap: Record<string, { subjects: Record<string, SubjectEntry> }> = {};

  for (const enrollment of scopedEnrollments) {
    const tid = enrollment.teacher_id;
    if (!tid) continue;
    if (!assignmentMap[tid]) assignmentMap[tid] = { subjects: {} };

    const subj = (enrollment as any).subjects;
    const studentProfile = (enrollment as any).profiles;
    const semesterId = subj?.semester_id || studentProfile?.semester_id || '';
    const subjectKey = `${enrollment.subject_id}__${semesterId}`;
    const section = studentProfile?.section || 'Unassigned';
    const semesterName = subj?.semesters?.name || 'N/A';

    if (!assignmentMap[tid].subjects[subjectKey]) {
      assignmentMap[tid].subjects[subjectKey] = {
        subject_name: subj?.subject_name || 'Unknown',
        subject_code: subj?.subject_code || '',
        semester: semesterName,
        sections: new Set(),
        attendanceBySec: {},
      };
    }

    const entry = assignmentMap[tid].subjects[subjectKey];
    entry.sections.add(section);

    // Attendance count per section
    if (!entry.attendanceBySec[section]) {
      entry.attendanceBySec[section] = { total: 0, filled: 0 };
    }
    entry.attendanceBySec[section].total++;
    if (enrollment.attendance_pct !== null && enrollment.attendance_pct !== undefined) {
      entry.attendanceBySec[section].filled++;
    }
  }

  return teachers.map(teacher => ({
    ...teacher,
    assignments: assignmentMap[teacher.id]
      ? Object.values(assignmentMap[teacher.id].subjects).map(s => ({
          subject_name: s.subject_name,
          subject_code: s.subject_code,
          semester: s.semester,
          sections: Array.from(s.sections),
          attendanceBySec: s.attendanceBySec,
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
