import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// STUDENT PROMOTION SYSTEM
// =======================
export const getPrePromotionData = async () => {
  const { data, error } = await supabase.rpc('export_pre_promotion_data');
  if (error) throw error;
  return data;
};

/**
 * Pre-flight validation: checks that every department has all required
 * "next" semesters before we call the promote RPC.
 * Returns { valid: true } or { valid: false, missing: [...] }.
 */
export const validatePromotionReadiness = async () => {
  // 1. Get all active students grouped by department + semester name
  const { data: students, error: studErr } = await supabase
    .from('profiles')
    .select('department_id, semester_id, departments!profiles_department_id_fkey(name), semesters!profiles_semester_id_fkey(name)')
    .eq('role', 'student')
    .or('status.is.null,status.eq.active');
  if (studErr) throw studErr;

  // 2. Get all semesters in the system
  const { data: allSemesters, error: semErr } = await supabase
    .from('semesters')
    .select('id, name, department_id');
  if (semErr) throw semErr;

  // Build a lookup: deptId -> Set of semester names
  const semestersByDept = new Map<string, Set<string>>();
  for (const sem of (allSemesters || [])) {
    if (!semestersByDept.has(sem.department_id)) semestersByDept.set(sem.department_id, new Set());
    semestersByDept.get(sem.department_id)!.add(sem.name);
  }

  // 3. For each student, check the "next" semester exists
  const missing: { department: string; currentSem: string; requiredSem: string }[] = [];
  const checked = new Set<string>(); // avoid duplicate checks

  for (const s of (students || [])) {
    const deptId = s.department_id;
    const deptName = (s as any).departments?.name || deptId;
    const semName = (s as any).semesters?.name;
    if (!deptId || !semName) continue;

    const currentNum = parseInt(semName);
    if (isNaN(currentNum)) continue;

    // 8th sem students graduate — no next semester needed
    if (currentNum >= 8) continue;

    const nextSemName = String(currentNum + 1);
    const key = `${deptId}_${nextSemName}`;
    if (checked.has(key)) continue;
    checked.add(key);

    const deptSems = semestersByDept.get(deptId);
    if (!deptSems || !deptSems.has(nextSemName)) {
      missing.push({ department: deptName, currentSem: semName, requiredSem: nextSemName });
    }
  }

  if (missing.length > 0) {
    return { valid: false as const, missing };
  }
  return { valid: true as const, missing: [] };
};

export const promoteAllStudents = async () => {
  const { data, error } = await supabase.rpc('promote_all_students');
  if (error) throw error;
  logActivity('Promoted All Students', `Mass promotion completed: ${JSON.stringify(data)}`);
  return data;
};

export const getPromotionPreview = async () => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, department_id, semester_id, section, departments!profiles_department_id_fkey(name), semesters!profiles_semester_id_fkey(name)').eq('role', 'student').or('status.is.null,status.eq.active').order('roll_number').range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
};

export const getGraduatedStudents = async () => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, roll_number, department_id, batch, section, created_at, departments!profiles_department_id_fkey(name)').eq('role', 'student').eq('status', 'graduated').order('roll_number').range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
};

export const getActiveStudentsDetails = async () => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('profiles').select('id, full_name, roll_number, department_id, section, created_at, semesters!profiles_semester_id_fkey(name), departments!profiles_department_id_fkey(name)').eq('role', 'student').or('status.is.null,status.eq.active').order('roll_number').range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
};

export const removeGraduatedStudents = async (studentIds: string[]) => {
  if (studentIds.length === 0) return 0;
  for (let i = 0; i < studentIds.length; i += 200) {
    const chunk = studentIds.slice(i, i + 200);
    const { error } = await supabase.from('profiles').delete().in('id', chunk);
    if (error) throw error;
  }
  logActivity('Removed Graduated Students', `Permanently removed ${studentIds.length} graduated students`);
  return studentIds.length;
};

export const getStudentsNeedingSections = async (departmentId: string) => {
  const { data: semesters, error: semErr } = await supabase.from('semesters').select('id').eq('department_id', departmentId).eq('name', '3');
  if (semErr) throw semErr;
  if (!semesters || semesters.length === 0) return [];
  const semId = semesters[0].id;
  const { data, error } = await supabase.from('profiles').select('id, full_name, roll_number, section, semester_id, semesters!profiles_semester_id_fkey(name)').eq('department_id', departmentId).eq('semester_id', semId).eq('role', 'student').is('section', null).order('roll_number');
  if (error) throw error;
  return data;
};

export const bulkAssignSections = async (assignments: { student_id: string; section: string }[]) => {
  let updated = 0;
  for (const { student_id, section } of assignments) {
    const { error } = await supabase
      .from('profiles')
      .update({ section: section ? section.toUpperCase() : null })
      .eq('id', student_id);
    if (error) throw error;
    updated++;
  }
  logActivity('Bulk Section Assignment', `Assigned sections to ${updated} students`);
  return updated;
};

export const bulkAssignSectionsCSV = async (departmentId: string, rows: { roll_number: string; section: string }[]) => {
  let updated = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const { roll_number, section } = rows[i];
    try {
      const { data: students, error: findErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('department_id', departmentId)
        .eq('roll_number', roll_number)
        .eq('role', 'student')
        .limit(1);
      if (findErr) throw findErr;
      if (!students || students.length === 0) {
        errors.push(`Row ${i + 1}: Student '${roll_number}' not found`);
        continue;
      }
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ section: section ? section.toUpperCase() : null })
        .eq('id', students[0].id);
      if (upErr) throw upErr;
      updated++;
    } catch (err: any) {
      errors.push(`Row ${i + 1} (${roll_number}): ${err.message}`);
    }
  }
  logActivity('CSV Section Assignment', `Assigned sections to ${updated}/${rows.length} students in department`);
  return { updated, errors };
};

export const getSectionsForSemester = async (departmentId: string, semesterId: string) => {
  const { data, error } = await supabase.from('profiles').select('section').eq('department_id', departmentId).eq('semester_id', semesterId).eq('role', 'student').not('section', 'is', null);
  if (error) throw error;
  return [...new Set((data || []).map((d: any) => d.section).filter(Boolean))].sort() as string[];
};

export const updateStudentSection = async (studentId: string, section: string | null) => {
  const { error } = await supabase.from('profiles').update({ section: section ? section.toUpperCase() : null }).eq('id', studentId);
  if (error) throw error;
  logActivity('Updated Section', `Updated section for student to ${section || 'None'}`);
};

export const deleteSection = async (departmentId: string, semesterId: string, sectionName: string) => {
  const { data, error } = await supabase.from('profiles').update({ section: null }).eq('department_id', departmentId).eq('semester_id', semesterId).eq('section', sectionName).eq('role', 'student').select('id');
  if (error) throw error;
  logActivity('Deleted Section', `Removed section "${sectionName}" from ${data?.length || 0} students`);
  return data?.length || 0;
};
