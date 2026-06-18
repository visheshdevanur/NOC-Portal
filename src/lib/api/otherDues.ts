import { supabase } from '../supabase';

// =======================
// OTHER DUES (HOD / FYC / Admin)
// =======================

/**
 * Fetch all other_dues for a specific department, with student profile info.
 */
export const getOtherDuesForDept = async (departmentId: string) => {
  let allData: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('other_dues')
      .select('*, profiles!other_dues_student_id_fkey(full_name, roll_number, section, department_id, semester_id, semesters(name), departments!profiles_department_id_fkey(name))')
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    allData = [...allData, ...(data || [])];
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return allData;
};

/**
 * Fetch all other_dues globally (for FYC / Admin).
 */
export const getOtherDuesGlobal = async () => {
  let allData: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('other_dues')
      .select('*, profiles!other_dues_student_id_fkey(full_name, roll_number, section, department_id, semester_id, semesters(name), departments!profiles_department_id_fkey(name))')
      .order('created_at', { ascending: false })
      .range(offset, offset + 999);
    if (error) throw error;
    allData = [...allData, ...(data || [])];
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return allData;
};

/**
 * Fetch other_dues for a specific student.
 */
export const getStudentOtherDues = async (studentId: string) => {
  const { data, error } = await supabase
    .from('other_dues')
    .select('*, departments!other_dues_department_id_fkey(name)')
    .eq('student_id', studentId);
  if (error) throw error;
  return data || [];
};

/**
 * Create or update an other_due record for a student.
 */
export const upsertOtherDue = async (
  studentId: string,
  departmentId: string | null,
  amount: number,
  remarks: string,
  createdBy: string,
  tenantId?: string | null
) => {
  // Check if a due already exists for this student + department
  let query = supabase
    .from('other_dues')
    .select('id')
    .eq('student_id', studentId);
  if (departmentId) query = query.eq('department_id', departmentId);

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('other_dues')
      .update({ amount, remarks, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    // Insert new
    const { error } = await supabase
      .from('other_dues')
      .insert([{
        student_id: studentId,
        department_id: departmentId,
        amount,
        remarks,
        status: 'pending',
        created_by: createdBy,
        tenant_id: tenantId || null,
      }]);
    if (error) throw error;
  }
};

/**
 * Modify the amount of an existing other_due.
 */
export const modifyOtherDue = async (dueId: string, amount: number) => {
  const { error } = await supabase
    .from('other_dues')
    .update({ amount, status: amount <= 0 ? 'paid' : 'pending', updated_at: new Date().toISOString() })
    .eq('id', dueId);
  if (error) throw error;
};

/**
 * Mark an other_due as paid (cleared by cash).
 */
export const clearOtherDue = async (dueId: string) => {
  const { error } = await supabase
    .from('other_dues')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', dueId);
  if (error) throw error;
};

/**
 * Delete an other_due record.
 */
export const deleteOtherDue = async (dueId: string) => {
  const { error } = await supabase
    .from('other_dues')
    .delete()
    .eq('id', dueId);
  if (error) throw error;
};

/**
 * Bulk upsert other_dues from CSV upload.
 * CSV format: USN, Amount, Remarks
 * Students NOT in the CSV will have their pending dues cleared (set to paid).
 */
export const bulkUpsertOtherDues = async (
  records: { usn: string; amount: number; remarks: string }[],
  departmentId: string | null,
  createdBy: string,
  tenantId?: string | null
) => {
  const results = { success: 0, failed: 0, cleared: 0, errors: [] as string[] };

  // 1. Resolve USNs to student IDs
  const usnToStudent = new Map<string, { id: string; full_name: string }>();
  for (const rec of records) {
    const usn = rec.usn.trim().toUpperCase();
    if (!usn) continue;

    let query = supabase
      .from('profiles')
      .select('id, full_name')
      .eq('roll_number', usn)
      .eq('role', 'student');

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      results.errors.push(`USN "${usn}" not found in ${departmentId ? 'your department' : 'the system'}`);
      results.failed++;
      continue;
    }
    usnToStudent.set(usn, data);
  }

  // 2. Upsert dues for students in the CSV
  const processedStudentIds = new Set<string>();
  for (const rec of records) {
    const usn = rec.usn.trim().toUpperCase();
    const student = usnToStudent.get(usn);
    if (!student) continue;

    try {
      await upsertOtherDue(student.id, departmentId, rec.amount, rec.remarks, createdBy, tenantId);
      processedStudentIds.add(student.id);
      results.success++;
    } catch (err: any) {
      results.errors.push(`Failed to set dues for "${usn}": ${err.message}`);
      results.failed++;
    }
  }

  return results;
};
