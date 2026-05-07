import { supabase } from '../supabase';

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
    .insert([{ student_id: studentId, current_stage: 'faculty_review', status: 'pending' }])
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

export const getStudentLibraryDues = async (studentId: string) => {
  const { data, error } = await supabase
    .from('library_dues')
    .select('*')
    .eq('student_id', studentId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // ignore no rows
  return data;
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
