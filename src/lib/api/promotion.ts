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

export const promoteAllStudents = async () => {
  const { data, error } = await supabase.rpc('promote_all_students');
  if (error) throw error;
  logActivity('Promoted All Students', `Mass promotion completed: ${JSON.stringify(data)}`);
  return data;
};

export const getPromotionPreview = async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name, department_id, semester_id, section, departments!profiles_department_id_fkey(name), semesters!profiles_semester_id_fkey(name)').eq('role', 'student').or('status.is.null,status.eq.active').order('full_name').limit(10000);
  if (error) throw error;
  return data;
};

export const getGraduatedStudents = async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name, roll_number, department_id, batch, section, created_at, departments!profiles_department_id_fkey(name)').eq('role', 'student').eq('status', 'graduated').order('full_name').limit(10000);
  if (error) throw error;
  return data;
};

export const getActiveStudentsDetails = async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name, roll_number, department_id, section, created_at, semesters!profiles_semester_id_fkey(name), departments!profiles_department_id_fkey(name)').eq('role', 'student').or('status.is.null,status.eq.active').order('full_name').limit(10000);
  if (error) throw error;
  return data;
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
  const { data, error } = await supabase.from('profiles').select('id, full_name, roll_number, section, semester_id, semesters!profiles_semester_id_fkey(name)').eq('department_id', departmentId).eq('semester_id', semId).eq('role', 'student').is('section', null).order('full_name');
  if (error) throw error;
  return data;
};

export const bulkAssignSections = async (assignments: { student_id: string; section: string }[]) => {
  const { data, error } = await supabase.rpc('rpc_bulk_assign_sections', { p_assignments: assignments });
  if (error) throw error;
  const result = data as { updated?: number } | null;
  return result?.updated || 0;
};

export const bulkAssignSectionsCSV = async (departmentId: string, rows: { roll_number: string; section: string }[]) => {
  const { data, error } = await supabase.rpc('rpc_bulk_assign_sections_csv', { p_department_id: departmentId, p_rows: rows });
  if (error) throw error;
  const result = data as { updated?: number; errors?: string[] } | null;
  const updated = result?.updated || 0;
  const errors = result?.errors || [];
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
