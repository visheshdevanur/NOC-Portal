import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// COE SPECIFIC API
// Uses edge function for RLS-restricted tables
// =======================

/** Fetch all departments (readable by all authenticated users) */
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

/** Fetch enrolled students via edge function (bypasses RLS) */
export const getEnrolledStudents = async (subjectId: string) => {
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action: 'coe-get-students', subject_id: subjectId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data || [];
};

/** Fetch IA attendance via edge function */
export const getIAAttendance = async (subjectId: string, iaNumber: number) => {
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action: 'coe-get-attendance', subject_id: subjectId, ia_number: iaNumber },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data || [];
};

/** Save IA attendance via edge function */
export const saveIAAttendanceCOE = async (
  records: { student_id: string; subject_id: string; teacher_id: string; ia_number: number; is_present: boolean }[]
) => {
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action: 'coe-save-attendance', records },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  logActivity('COE IA Attendance', `Updated IA attendance for ${records.length} students`);
  return true;
};

/** Process global CSV via edge function — resolves USNs and subject codes server-side */
export const processGlobalCSV = async (csvText: string, coeUserId: string) => {
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { processed: 0, errors: ['CSV file is empty or has no data rows'] };

  // Parse CSV rows (skip header)
  const csv_rows: { usn: string; subject_code: string; ia_name: string }[] = [];
  const parseErrors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());
    if (parts.length < 3) {
      parseErrors.push(`Row ${i + 1}: Expected 3 columns (USN, Subject Code, IA Name)`);
      continue;
    }
    csv_rows.push({ usn: parts[0], subject_code: parts[1], ia_name: parts[2] });
  }

  if (csv_rows.length === 0) return { processed: 0, errors: parseErrors };

  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action: 'coe-process-csv', csv_rows, coe_user_id: coeUserId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  const allErrors = [...parseErrors, ...(data?.errors || [])];
  logActivity('COE CSV Upload', `Processed ${data?.processed || 0} absentee records from CSV`);
  return { processed: data?.processed || 0, errors: allErrors };
};

/** Generate CSV template content */
export const generateCSVTemplate = (): string => {
  return 'USN,Subject Code,IA Name\n';
};
