import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// COE SPECIFIC API
// =======================

/** Fetch all departments */
export const getAllDepartments = async () => {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return data || [];
};

/** Fetch semesters for a given department */
export const getSemestersByDepartment = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('semesters')
    .select('id, name')
    .eq('department_id', departmentId)
    .order('name');
  if (error) throw error;
  return data || [];
};

/** Fetch subjects for a given department + semester */
export const getSubjectsForDeptSem = async (departmentId: string, semesterId: string) => {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, subject_name, subject_code')
    .eq('department_id', departmentId)
    .eq('semester_id', semesterId)
    .order('subject_name');
  if (error) throw error;
  return data || [];
};

/** Fetch ALL enrolled students for a subject (no teacher_id / section filter — COE is cross-section) */
export const getEnrolledStudents = async (subjectId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .select('student_id, profiles!subject_enrollment_student_id_fkey(id, full_name, roll_number, section)')
    .eq('subject_id', subjectId);
  if (error) throw error;
  // Deduplicate by student_id (in case of multiple enrollments)
  const seen = new Set<string>();
  return (data || []).filter((row: any) => {
    if (seen.has(row.student_id)) return false;
    seen.add(row.student_id);
    return true;
  });
};

/** Fetch existing IA attendance for a subject + IA number (no teacher_id filter) */
export const getIAAttendance = async (subjectId: string, iaNumber: number) => {
  const { data, error } = await supabase
    .from('ia_attendance')
    .select('student_id, is_present')
    .eq('subject_id', subjectId)
    .eq('ia_number', iaNumber);
  if (error) throw error;
  return data || [];
};

/** Save IA attendance records (COE user's ID as teacher_id) */
export const saveIAAttendanceCOE = async (
  records: { student_id: string; subject_id: string; teacher_id: string; ia_number: number; is_present: boolean }[]
) => {
  const BATCH_SIZE = 25;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('ia_attendance')
      .upsert(batch, { onConflict: 'student_id,subject_id,ia_number' });
    if (error) throw error;
  }
  logActivity('COE IA Attendance', `Updated IA attendance for ${records.length} students`);
  return true;
};

/** Parse a CSV file of absentees and return upsert-ready records.
 *  CSV columns: USN, Subject Code, IA Name (IA1/IA2/IA3)
 *  Only absentees are listed — everyone else is Present by default.
 */
export const parseAbsenteeCSV = async (
  csvText: string,
  subjectId: string,
  subjectCode: string,
  iaNumber: number,
  coeUserId: string,
  enrolledStudents: { student_id: string; profiles: { roll_number: string | null } }[]
): Promise<{ records: any[]; errors: string[] }> => {
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { records: [], errors: ['CSV file is empty or has no data rows'] };

  // Skip header
  const dataLines = lines.slice(1);
  const errors: string[] = [];
  const absentUSNs = new Set<string>();

  // Build USN → student_id map
  const usnMap = new Map<string, string>();
  enrolledStudents.forEach((e: any) => {
    const usn = e.profiles?.roll_number?.toUpperCase();
    if (usn) usnMap.set(usn, e.student_id);
  });

  for (let i = 0; i < dataLines.length; i++) {
    const parts = dataLines[i].split(',').map(p => p.trim());
    if (parts.length < 3) {
      errors.push(`Row ${i + 2}: Expected 3 columns (USN, Subject Code, IA Name)`);
      continue;
    }
    const [usn, csvSubjectCode, iaName] = parts;

    // Validate subject code matches
    if (csvSubjectCode.toUpperCase() !== subjectCode.toUpperCase()) {
      errors.push(`Row ${i + 2}: Subject code "${csvSubjectCode}" doesn't match selected subject "${subjectCode}"`);
      continue;
    }

    // Validate IA name
    const csvIANum = parseInt(iaName.replace(/\D/g, ''), 10);
    if (isNaN(csvIANum) || csvIANum !== iaNumber) {
      errors.push(`Row ${i + 2}: IA name "${iaName}" doesn't match selected IA${iaNumber}`);
      continue;
    }

    // Validate USN exists in enrolled students
    const studentId = usnMap.get(usn.toUpperCase());
    if (!studentId) {
      errors.push(`Row ${i + 2}: USN "${usn}" not found in enrolled students`);
      continue;
    }

    absentUSNs.add(usn.toUpperCase());
  }

  // Build records: absentees = absent, everyone else = present
  const records = enrolledStudents.map((e: any) => ({
    student_id: e.student_id,
    subject_id: subjectId,
    teacher_id: coeUserId,
    ia_number: iaNumber,
    is_present: !absentUSNs.has(e.profiles?.roll_number?.toUpperCase() || ''),
  }));

  return { records, errors };
};

/** Generate CSV template content */
export const generateCSVTemplate = (): string => {
  return 'USN,Subject Code,IA Name\n';
};
