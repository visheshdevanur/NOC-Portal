import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// ADMIN: ALL USERS & HALL-TICKET STATUS
// =======================
export const getAllUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, departments(name)')
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) throw error;
  return data;
};

export const getAllStudentStatuses = async () => {
  const { data, error } = await supabase
    .from('clearance_requests')
    .select('*, profiles!clearance_requests_student_id_fkey(full_name, department_id, section, departments(name))')
    .limit(10000);
  if (error) throw error;
  return data;
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

export const createSubject = async (subject: { subject_name: string; subject_code: string; department_id: string; semester_id: string }) => {
  const { data, error } = await supabase.from('subjects').insert(subject).select();
  if (error) throw error;
  return data;
};

export const deleteSubject = async (subjectId: string) => {
  const { error } = await supabase.from('subjects').delete().eq('id', subjectId);
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
  const { data, error } = await supabase.from('profiles').select('*, semesters(name)').eq('department_id', departmentId).in('role', roles).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
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
  const { data, error } = await supabase.from('imported_teachers').select('teacher_id, created_at, profiles!inner(id, full_name, email, role, departments!profiles_department_id_fkey(name))').eq('department_id', departmentId);
  if (error && error.code === '42P01') return [];
  if (error) throw error;
  return data || [];
};

export const importTeachersToDept = async (departmentId: string, teacherIds: string[], userId: string) => {
  const records = teacherIds.map(id => ({ department_id: departmentId, teacher_id: id, created_by: userId }));
  const { error } = await supabase.from('imported_teachers').insert(records);
  if (error) throw error;
};

export const removeImportedTeacher = async (departmentId: string, teacherId: string) => {
  const { error } = await supabase.from('imported_teachers').delete().eq('department_id', departmentId).eq('teacher_id', teacherId);
  if (error) throw error;
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
  const subCache = new Map<string, any[]>();
  const getSemMap = async (deptId: string) => { if (semCache.has(deptId)) return semCache.get(deptId)!; const { data: sems } = await supabase.from('semesters').select('id, name').eq('department_id', deptId); const map = new Map((sems || []).map(s => [s.name.toLowerCase(), s.id])); semCache.set(deptId, map); return map; };
  const getSubjects = async () => { if (subCache.has('all')) return subCache.get('all')!; const { data: subs } = await supabase.from('subjects').select('id, subject_code, semester_id'); subCache.set('all', subs || []); return subs || []; };
  const { data: teachers } = await supabase.from('profiles').select('id, roll_number').in('role', ['teacher', 'faculty']);
  const teacherMap = new Map((teachers || []).map(t => [t.roll_number?.toLowerCase(), t.id]));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      let rowDeptId = departmentId;
      if (row.dept_name) { const resolved = deptNameMap.get(row.dept_name.toLowerCase()); if (!resolved) throw new Error(`Department '${row.dept_name}' not found.`); rowDeptId = resolved; }
      const semMap = await getSemMap(rowDeptId);
      const semId = semMap.get(row.semester_name.toLowerCase());
      if (!semId) throw new Error(`Semester '${row.semester_name}' not found.`);
      const subs = await getSubjects();
      const sub = subs.find(s => s.subject_code.toLowerCase() === row.subject_code.toLowerCase() && s.semester_id === semId);
      if (!sub) throw new Error(`Subject '${row.subject_code}' not found in semester '${row.semester_name}'.`);
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
