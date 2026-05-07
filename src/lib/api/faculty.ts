import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// FACULTY SPECIFIC
// =======================
export const getFacultyPendingStudents = async (facultyId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name, section, semester_id, roll_number, department_id, semesters(name), departments!profiles_department_id_fkey(name)), subjects(*, departments!subjects_department_id_fkey(name))')
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
  const updatePayload: any = { status: status, attendance_pct: attendancePct, remarks };
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
// IA ATTENDANCE
// =======================
export const getTeacherSubjectsList = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('subject_id, subjects!subject_enrollment_subject_id_fkey(id, subject_name, subject_code, semester_id, department_id, semesters(name), departments!subjects_department_id_fkey(name))')
    .eq('teacher_id', teacherId);
  if (error) throw error;
  const subjectMap = new Map();
  (data || []).forEach((row: any) => {
    if (row.subjects && !subjectMap.has(row.subject_id)) {
      subjectMap.set(row.subject_id, row.subjects);
    }
  });
  return Array.from(subjectMap.values());
};

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

export const getStudentsForSubject = async (subjectId: string, teacherId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('student_id, profiles!subject_enrollment_student_id_fkey(id, full_name, roll_number, section, semester_id)')
    .eq('subject_id', subjectId)
    .eq('teacher_id', teacherId);
  if (error) throw error;
  return data;
};

export const saveIAAttendance = async (
  records: { student_id: string; subject_id: string; teacher_id: string; ia_number: number; is_present: boolean }[]
) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .upsert(records, { onConflict: 'student_id,subject_id,ia_number' })
    .select();
  if (error) throw error;
  logActivity('Saved IA Attendance', `Updated IA metrics for ${records.length} students`);
  return data;
};

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

export const getTeacherIAAttendance = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('student_id, subject_id, is_present')
    .eq('teacher_id', teacherId);
  if (error) throw error;
  return data;
};
