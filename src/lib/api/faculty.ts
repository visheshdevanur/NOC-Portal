import { supabase } from '../supabase';
import { logActivity } from './shared';
import { sanitizeRemarks, sanitizeNumber } from '../sanitize';

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
  // Sanitize inputs
  attendancePct = sanitizeNumber(attendancePct, 0, 100);
  remarks = sanitizeRemarks(remarks);

  // ── Hard guard: attendance < 85% MUST be rejected, no exceptions ──
  if (attendancePct < 85 && status === 'completed') {
    status = 'rejected';
    remarks = remarks || `Low Attendance (<85%)`;
  }

  const updatePayload: any = { status: status, attendance_pct: attendancePct, remarks };
  if (status === 'completed') {
    updatePayload.attendance_fee = 0;
    updatePayload.attendance_fee_verified = false;
  }

  // Verify the enrollment belongs to this teacher (defense-in-depth against RLS misconfiguration)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('subject_enrollment')
    .update(updatePayload)
    .eq('id', enrollmentId)
    .eq('teacher_id', user.id)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name)')
    .single();
  if (error) {
    if (error.code === 'PGRST116') throw new Error('Enrollment not found or you are not authorized to modify it.');
    throw error;
  }
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

export const getIACountForSubject = async (subjectId: string, teacherId: string, section?: string | null) => {
  // Get student IDs in this section first, then count IAs only for those students
  if (section) {
    const { data: enrollments } = await supabase
      .from('subject_enrollment')
      .select('student_id, profiles!subject_enrollment_student_id_fkey(section)')
      .eq('subject_id', subjectId)
      .eq('teacher_id', teacherId);
    const sectionStudentIds = (enrollments || []).filter((e: any) => (e.profiles?.section || 'Unassigned') === section).map((e: any) => e.student_id);
    if (sectionStudentIds.length === 0) return 0;
    const { data, error } = await supabase
      .from('ia_attendance')
      .select('ia_number')
      .eq('subject_id', subjectId)
      .in('student_id', sectionStudentIds)
      .order('ia_number', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0].ia_number : 0;
  }
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('ia_number')
    .eq('subject_id', subjectId)
    .order('ia_number', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0].ia_number : 0;
};

export const getStudentsForSubject = async (subjectId: string, teacherId: string, section?: string | null) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('student_id, profiles!subject_enrollment_student_id_fkey(id, full_name, roll_number, section, semester_id)')
    .eq('subject_id', subjectId)
    .eq('teacher_id', teacherId);
  if (error) throw error;
  // Filter by section on the client side if specified
  if (section) {
    return (data || []).filter((s: any) => (s.profiles?.section || 'Unassigned') === section);
  }
  return data;
};

export const saveIAAttendance = async (
  records: { student_id: string; subject_id: string; teacher_id: string; ia_number: number; is_present: boolean }[]
) => {
  // Batch into chunks to prevent connection timeouts on large class sizes
  const BATCH_SIZE = 25;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('ia_attendance')
      .upsert(batch, { onConflict: 'student_id,subject_id,ia_number' });
    if (error) throw error;
  }
  logActivity('Saved IA Attendance', `Updated IA metrics for ${records.length} students`);
  return true;
};

export const getIAAttendanceForSubject = async (subjectId: string, _teacherId: string, section?: string | null) => {
  // Use edge function to bypass RLS — so faculty can see COE-uploaded records
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action: 'get-ia-data', subject_id: subjectId, section: section || undefined },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data || [];
};

export const getTeacherIAAttendance = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('student_id, subject_id, ia_number, is_present')
    .eq('teacher_id', teacherId);
  if (error) throw error;
  return data;
};
