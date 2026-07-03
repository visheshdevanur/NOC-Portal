import { supabase } from '../supabase';
import { logActivity, normalizeSemName } from './shared';

// =======================
// ADMIN: ALL USERS & HALL-TICKET STATUS
// =======================
export const getAllUsers = async () => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, departments(name)')
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
};

export const getAllStudentStatuses = async () => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('clearance_requests')
      .select('*, profiles!clearance_requests_student_id_fkey(full_name, department_id, section, departments(name))')
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
};

export const getSubjectsByDepartment = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, departments(name), semesters(name)')
    .eq('department_id', departmentId)
    .order('subject_name');
  if (error) throw error;
  return data;
};

export const createSubject = async (subject: { subject_name: string; subject_code: string; department_id: string; semester_id: string; subject_type?: string }) => {
  // Check for duplicate subject_code in same department + semester
  const { data: existing } = await supabase
    .from('subjects')
    .select('id')
    .eq('department_id', subject.department_id)
    .eq('semester_id', subject.semester_id)
    .ilike('subject_code', subject.subject_code)
    .limit(1);
  if (existing && existing.length > 0) {
    throw new Error(`Subject with code "${subject.subject_code.toUpperCase()}" already exists in this semester.`);
  }
  const { data, error } = await supabase.from('subjects').insert({
    ...subject,
    subject_type: subject.subject_type || 'theory',
  }).select();
  if (error) throw error;
  return data;
};

export const deleteSubject = async (subjectId: string) => {
  const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
  if (error) throw error;
};

// ── Section-Teacher Assignment Management ──

/** Get all section-teacher assignments for a department */
export const getSectionTeacherAssignments = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('section_teacher_assignments')
    .select('*, profiles!section_teacher_assignments_teacher_id_fkey(full_name, email), subjects(subject_name, subject_code, semester_id, semesters(name))')
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

/** Remove a section-teacher assignment and its enrollment rows */
export const removeSectionTeacherAssignment = async (assignmentId: string, subjectId: string, section: string, teacherId: string) => {
  // Delete enrollment rows for this teacher+subject+section
  const { error: enrollError } = await supabase
    .from('subject_enrollment')
    .delete()
    .eq('subject_id', subjectId)
    .eq('teacher_id', teacherId);
  if (enrollError) throw enrollError;

  // Delete the junction record
  const { error } = await supabase
    .from('section_teacher_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) throw error;
  logActivity('Removed Section Assignment', `Removed teacher from section ${section}`);
};

/** Get students assigned to a specific teacher+subject+section */
export const getStudentsForAssignment = async (_subjectId: string, section: string, semesterId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, roll_number, section, semester_id')
    .eq('role', 'student')
    .eq('section', section)
    .eq('semester_id', semesterId)
    .order('roll_number');
  if (error) throw error;
  return data || [];
};

/** Delete a student permanently (profile + auth) */
export const deleteStudentPermanently = async (studentId: string) => {
  // Delete all related data first
  await supabase.from('subject_enrollment').delete().eq('student_id', studentId);
  await supabase.from('clearance_requests').delete().eq('student_id', studentId);
  await supabase.from('library_dues').delete().eq('student_id', studentId);
  await supabase.from('student_dues').delete().eq('student_id', studentId);
  // Delete profile
  const { error } = await supabase.from('profiles').delete().eq('id', studentId);
  if (error) throw error;
  // Auth user deletion requires edge function (service_role)
  const { error: fnError } = await supabase.functions.invoke('admin-api', {
    body: { action: 'delete-user', userId: studentId },
  });
  if (fnError) console.warn('Auth deletion may need manual cleanup:', fnError);
  logActivity('Deleted Student', `Permanently deleted student ${studentId}`);
};

/** Toggle OE Faculty status */
export const toggleOEFaculty = async (userId: string, isOE: boolean) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_oe_faculty: isOE })
    .eq('id', userId);
  if (error) throw error;
  logActivity('OE Faculty Toggle', `Set is_oe_faculty=${isOE} for user ${userId}`);
};

/** Save section-teacher assignment to junction table */
export const saveSectionTeacherAssignment = async (subjectId: string, section: string, teacherId: string, semesterId: string, departmentId: string, tenantId: string) => {
  const { error } = await supabase
    .from('section_teacher_assignments')
    .upsert({
      subject_id: subjectId,
      section,
      teacher_id: teacherId,
      semester_id: semesterId,
      department_id: departmentId,
      tenant_id: tenantId,
    }, { onConflict: 'subject_id,section,teacher_id' });
  if (error) throw error;
};

export const getDepartmentSections = async (departmentId: string) => {
  const { data, error } = await supabase.from('profiles').select('section').eq('department_id', departmentId).eq('role', 'student').not('section', 'is', null);
  if (error) throw error;
  return [...new Set((data || []).map((d: any) => d.section).filter(Boolean))] as string[];
};

export const deleteUser = async (userId: string) => {
  const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId });
  if (error) throw error;
};

export const getDepartmentById = async (departmentId: string) => {
  const { data, error } = await supabase.from('departments').select('*').eq('id', departmentId).single();
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
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('profiles').select('*, semesters(name)').eq('department_id', departmentId).in('role', roles).order('roll_number').range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
};

export const updateSubjectAPI = async (id: string, updates: Record<string, any>) => {
  const { data, error } = await supabase.from('subjects').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const updateUserAPI = async (id: string, updates: Record<string, any>) => {
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const adminUpdateUserCredentials = async (userId: string, email: string, password?: string) => {
  const { error } = await supabase.rpc('admin_update_user_credentials', { target_user_id: userId, new_email: email, new_password: password || null });
  if (error) throw error;
};

export const getUserNotifications = async (userId: string) => {
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const markNotificationRead = async (notificationId: string) => {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
  if (error) throw error;
};

export const createSemester = async (name: string, departmentId: string) => {
  const { data, error } = await supabase.from('semesters').insert({ name, department_id: departmentId }).select().single();
  if (error) throw error;
  return data;
};

export const getSemestersByDepartment = async (departmentId: string) => {
  const { data, error } = await supabase.from('semesters').select('*').eq('department_id', departmentId).order('name');
  if (error) throw error;
  return data;
};

export const getUnassignedSubjects = async () => {
  const { data, error } = await supabase.from('subject_enrollment').select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(*)').is('teacher_id', null);
  if (error) throw error;
  return data;
};

export const assignTeacherToSubject = async (enrollmentId: string, teacherId: string) => {
  const { data, error } = await supabase.from('subject_enrollment').update({ teacher_id: teacherId }).eq('id', enrollmentId).select().single();
  if (error) throw error;
  return data;
};

export const getAllFaculty = async (departmentId?: string) => {
  if (!departmentId) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, department_id').in('role', ['faculty', 'teacher']);
    if (error) throw error;
    return data;
  }
  const { data: nativeTeachers, error: nativeError } = await supabase.from('profiles').select('id, full_name, department_id').in('role', ['faculty', 'teacher']).eq('department_id', departmentId);
  if (nativeError) throw nativeError;
  const { data: importedData, error: importError } = await supabase.from('imported_teachers').select('profiles!inner(id, full_name, department_id)').eq('department_id', departmentId);
  if (importError && importError.code !== '42P01') console.error(importError);
  const importedTeachers = (importedData || []).map((imp: any) => imp.profiles).filter(Boolean);
  const allTeachers = [...(nativeTeachers || []), ...importedTeachers];
  const uniqueTeachersMap = new Map();
  allTeachers.forEach(t => uniqueTeachersMap.set(t.id, t));
  return Array.from(uniqueTeachersMap.values());
};

export const getImportableTeachers = async (departmentId: string) => {
  const { data: imported, error: impErr } = await supabase.from('imported_teachers').select('teacher_id').eq('department_id', departmentId);
  if (impErr && impErr.code !== '42P01') throw impErr;
  const importedIds = new Set((imported || []).map(i => i.teacher_id));
  const { data: allImports } = await supabase.from('imported_teachers').select('teacher_id, department_id');
  const importedByDept: Record<string, Set<string>> = {};
  for (const imp of (allImports || [])) {
    if (!importedByDept[imp.department_id]) importedByDept[imp.department_id] = new Set();
    importedByDept[imp.department_id].add(imp.teacher_id);
  }
  const { data: otherDeptTeachers, error } = await supabase.from('profiles').select('id, full_name, role, email, created_by, department_id, departments!profiles_department_id_fkey(name)').in('role', ['teacher', 'faculty']).neq('department_id', departmentId).order('full_name');
  const { data: noDeptTeachers, error: noDeptErr } = await supabase.from('profiles').select('id, full_name, role, email, created_by, department_id, departments!profiles_department_id_fkey(name)').in('role', ['teacher', 'faculty']).is('department_id', null).order('full_name');
  if (noDeptErr) console.error(noDeptErr);
  const data2 = [...(otherDeptTeachers || []), ...(noDeptTeachers || [])];
  if (error) throw error;
  return (data2 || []).filter(t => !importedIds.has(t.id)).map(t => ({ ...t, _importedIntoDepts: Object.entries(importedByDept).filter(([_, ids]) => ids.has(t.id)).map(([deptId]) => deptId) }));
};

export const getImportedTeachersForDept = async (departmentId: string) => {
  const { data, error } = await supabase.from('imported_teachers').select('teacher_id, created_at, profiles!inner(id, full_name, email, role, roll_number, department_id, departments!profiles_department_id_fkey(name))').eq('department_id', departmentId);
  if (error && error.code === '42P01') return [];
  if (error) throw error;
  return data || [];
};

export const importTeachersToDept = async (departmentId: string, teacherIds: string[], userId: string) => {
  // Fetch tenant_id from user's profile (required by RLS policy)
  const { data: userProfile } = await supabase.from('profiles').select('tenant_id').eq('id', userId).single();
  const tenantId = userProfile?.tenant_id || null;
  const records = teacherIds.map(id => ({ department_id: departmentId, teacher_id: id, created_by: userId, tenant_id: tenantId }));
  const { error } = await supabase.from('imported_teachers').insert(records);
  if (error) throw error;
};

export const removeImportedTeacher = async (departmentId: string, teacherId: string) => {
  const { error } = await supabase.from('imported_teachers').delete().eq('department_id', departmentId).eq('teacher_id', teacherId);
  if (error) throw error;
};

/** Assign teacher to ONLY selected students (not entire section) */
export const assignTeacherToSelectedStudents = async (subjectId: string, section: string, teacherId: string, studentIds: string[]) => {
  if (studentIds.length === 0) throw new Error('No students selected');
  
  const results: any[] = [];
  for (const studentId of studentIds) {
    // Check if enrollment already exists
    const { data: existing } = await supabase
      .from('subject_enrollment')
      .select('id')
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    
    if (existing) {
      results.push(existing);
      continue;
    }

    const { data, error } = await supabase
      .from('subject_enrollment')
      .upsert({
        student_id: studentId,
        subject_id: subjectId,
        teacher_id: teacherId,
        status: 'pending',
        assignment_status: 'pending',
      }, { onConflict: 'student_id,subject_id,teacher_id' })
      .select()
      .single();
    if (error) console.warn('Enrollment error for student', studentId, error);
    if (data) results.push(data);
  }

  const { data: tProfile } = await supabase.from('profiles').select('full_name').eq('id', teacherId).single();
  const { data: sInfo } = await supabase.from('subjects').select('subject_name').eq('id', subjectId).single();
  logActivity('Assigned Teacher', `Assigned ${tProfile?.full_name || 'teacher'} to ${results.length} selected students in section ${section} for ${sInfo?.subject_name || 'subject'}`);
  return results;
};

export const assignTeacherToSection = async (subjectId: string, section: string, teacherId: string, semesterId: string) => {
  const { data, error } = await supabase.rpc('assign_teacher_to_section_rpc', { p_subject_id: subjectId, p_section: section, p_teacher_id: teacherId, p_semester_id: semesterId });
  if (error) throw error;
  const { data: tProfile } = await supabase.from('profiles').select('full_name').eq('id', teacherId).single();
  const { data: sInfo } = await supabase.from('subjects').select('subject_name').eq('id', subjectId).single();
  logActivity('Assigned Teacher', `Assigned ${tProfile?.full_name || 'teacher'} to section ${section} for ${sInfo?.subject_name || 'subject'}`);
  return data;
};

export const bulkAssignTeacherToSectionCSV = async (departmentId: string, rows: { semester_name: string; subject_code: string; section: string; teacher_id: string; dept_name?: string }[]) => {
  const result = { updated: 0, errors: [] as string[] };
  const { data: allDepts } = await supabase.from('departments').select('id, name');
  const deptNameMap = new Map((allDepts || []).map(d => [d.name.toLowerCase(), d.id]));
  const semCache = new Map<string, Map<string, string>>();
  const getSemMap = async (deptId: string) => { if (semCache.has(deptId)) return semCache.get(deptId)!; const { data: sems } = await supabase.from('semesters').select('id, name').eq('department_id', deptId); const map = new Map((sems || []).map(s => [s.name.toLowerCase(), s.id])); semCache.set(deptId, map); return map; };

  // Direct DB lookup for a subject by code + department (most reliable, bypasses cache/RLS issues)
  const findSubjectDirect = async (subjectCode: string, deptId: string): Promise<any | null> => {
    const { data } = await supabase
      .from('subjects')
      .select('id, subject_code, semester_id, department_id')
      .eq('department_id', deptId)
      .ilike('subject_code', subjectCode)
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  };

  // Fallback: search across ALL departments
  const findSubjectAnyDept = async (subjectCode: string): Promise<any | null> => {
    const { data } = await supabase
      .from('subjects')
      .select('id, subject_code, semester_id, department_id')
      .ilike('subject_code', subjectCode)
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  };

  // Only fetch teachers native to this department + imported into this department
  const { data: nativeTeachers } = await supabase.from('profiles').select('id, roll_number').in('role', ['teacher', 'faculty']).eq('department_id', departmentId);
  const { data: importedData } = await supabase.from('imported_teachers').select('profiles!inner(id, roll_number)').eq('department_id', departmentId);
  const importedTeachers = (importedData || []).map((imp: any) => imp.profiles).filter(Boolean);
  const allValidTeachers = [...(nativeTeachers || []), ...importedTeachers];
  const teacherMap = new Map<string, string>();
  allValidTeachers.forEach(t => { if (t.roll_number) teacherMap.set(t.roll_number.toLowerCase(), t.id); });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      let rowDeptId = departmentId;
      if (row.dept_name) { const resolved = deptNameMap.get(row.dept_name.toLowerCase()); if (!resolved) throw new Error(`Department '${row.dept_name}' not found.`); rowDeptId = resolved; }
      const semMap = await getSemMap(rowDeptId);
      const normalizedSemInput = normalizeSemName(row.semester_name);
      const semId = semMap.get(normalizedSemInput.toLowerCase()) || semMap.get(row.semester_name.toLowerCase());
      if (!semId) throw new Error(`Semester '${row.semester_name}' not found.`);

      // Try direct DB query for this department first
      let sub = await findSubjectDirect(row.subject_code, rowDeptId);
      // If not found and CSV dept differs from UI dept, try the UI department
      if (!sub && rowDeptId !== departmentId) {
        sub = await findSubjectDirect(row.subject_code, departmentId);
      }
      // Last resort: search across ALL departments
      if (!sub) {
        sub = await findSubjectAnyDept(row.subject_code);
      }
      if (!sub) throw new Error(`Subject '${row.subject_code}' not found in any department.`);
      const tProfileId = teacherMap.get(row.teacher_id.toLowerCase());
      if (!tProfileId) throw new Error(`Teacher with ID '${row.teacher_id}' not found.`);
      await assignTeacherToSection(sub.id, row.section.toUpperCase(), tProfileId, semId);
      result.updated++;
    } catch (err: any) { result.errors.push(`Row ${i + 1} (${row.subject_code}): ${err.message}`); }
  }
  logActivity('Bulk Section Assignment', `Assigned ${result.updated} sections via CSV upload`);
  return result;
};

export const promoteStudents = async (sourceSemesterId: string, targetSemesterId: string, departmentId: string) => {
  const { data, error } = await supabase.rpc('promote_students_to_semester', { p_source_semester_id: sourceSemesterId, p_target_semester_id: targetSemesterId, p_department_id: departmentId });
  if (error) throw error;
  return data as number;
};

// =======================
// ATTENDANCE FREEZE TOGGLE
// =======================

/** Returns whether attendance is currently frozen for the given tenant. */
export const getAttendanceFreezeStatus = async (tenantId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('tenants')
    .select('attendance_frozen')
    .eq('id', tenantId)
    .single();
  if (error) throw error;
  return data?.attendance_frozen ?? false;
};

/** Admin-only: freeze or unfreeze attendance updates for the given tenant. */
export const setAttendanceFreezeStatus = async (tenantId: string, frozen: boolean): Promise<void> => {
  const { error } = await supabase
    .from('tenants')
    .update({ attendance_frozen: frozen })
    .eq('id', tenantId);
  if (error) throw error;
  logActivity(
    frozen ? 'Froze Attendance' : 'Unfroze Attendance',
    frozen
      ? 'Admin froze attendance — faculty cannot update attendance until unfrozen.'
      : 'Admin unfroze attendance — faculty can now update attendance.',
  );
};

