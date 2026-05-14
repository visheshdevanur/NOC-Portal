import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// ACCOUNTS SPECIFIC
// =======================
export const getAllStudentDues = async () => {
  const PAGE_SIZE = 1000;

  const fetchAllPaged = async (table: string, select: string, filters?: (q: any) => any) => {
    let all: any[] = [];
    let from = 0;
    while (true) {
      let q = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
      if (filters) q = filters(q);
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all;
  };

  // Run BOTH queries in parallel for speed
  const [allStudents, allDues] = await Promise.all([
    fetchAllPaged('profiles', 'id, full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)', q => q.eq('role', 'student').order('roll_number')),
    fetchAllPaged('student_dues', 'id, student_id, fine_amount, paid_amount, status, permitted_until, updated_at', q => q.order('student_id')),
  ]);

  // Build a map of student_id -> dues
  const duesMap = new Map(allDues.map(d => [d.student_id, d]));

  // Merge: every student gets a record
  return allStudents.map(student => {
    const dues = duesMap.get(student.id);
    return {
      id: dues?.id || null,
      student_id: student.id,
      fine_amount: dues?.fine_amount ?? 0,
      paid_amount: dues?.paid_amount ?? 0,
      status: dues?.status ?? 'pending',
      permitted_until: dues?.permitted_until ?? null,
      updated_at: dues?.updated_at ?? null,
      profiles: student,
    };
  });
};

export const markStudentDues = async (duesModuleId: string, status: string, fineAmount: number) => {
  const { data, error } = await supabase
    .from('student_dues')
    .update({ status: status, fine_amount: fineAmount })
    .eq('id', duesModuleId)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Could not update dues. Check permissions.");
  return data[0];
};

export const bulkProcessCollegeDues = async (pendingDues: { id: string, fine_amount: number }[], allDuesIds: string[]) => {
  const { data, error } = await supabase.rpc('bulk_process_college_dues', {
    p_pending_ids: pendingDues.map(d => d.id),
    p_pending_amounts: pendingDues.map(d => d.fine_amount),
    p_all_ids: allDuesIds,
  });
  if (error) throw error;
  await logActivity('Uploaded CSV for Dues', `Set ${pendingDues.length} students as pending, ${(data)?.cleared_updated || 0} marked completed.`);
  return true;
};

export const getStaffStudentDues = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('student_dues')
    .select('*, profiles!inner(full_name, section, roll_number, department_id, email, semesters(name))')
    .eq('profiles.department_id', departmentId);
  if (error) throw error;
  return data;
};

export const getAccountsApprovedDues = async () => {
  const { data, error } = await supabase
    .from('student_dues')
    .select('*, profiles!student_dues_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name))')
    .eq('status', 'completed');
  if (error) throw error;
  return data;
};

export const updateStudentPaidAmount = async (dueId: string, paidAmount: number) => {
  const { data, error } = await supabase
    .from('student_dues')
    .update({ paid_amount: paidAmount, updated_at: new Date().toISOString() })
    .eq('id', dueId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateStudentDueFee = async (dueId: string, fineAmount: number, paidAmount: number = 0) => {
  const status = fineAmount > 0 && fineAmount > paidAmount ? 'pending' : 'completed';
  const { error } = await supabase
    .from('student_dues')
    .update({ fine_amount: fineAmount, paid_amount: paidAmount, status, updated_at: new Date().toISOString() })
    .eq('id', dueId);
  if (error) throw error;
  return { id: dueId, fine_amount: fineAmount, paid_amount: paidAmount, status };
};

/**
 * Upsert a student_dues record. If dueId is provided, update by id.
 * If dueId is null (student has no dues row yet), create one using studentId.
 */
export const upsertStudentDue = async (dueId: string | null, studentId: string, updates: Record<string, any>) => {
  if (dueId) {
    const { error } = await supabase.from('student_dues').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', dueId);
    if (error) throw error;
  } else {
    // No existing dues row — create one
    const { error } = await supabase.from('student_dues').insert({ student_id: studentId, ...updates, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
};

// =======================
// ACCOUNTS: ATTENDANCE FEE VERIFICATION
// =======================
export const getAccountsPendingFeeVerifications = async () => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .select('*, profiles!subject_enrollment_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
      .gt('attendance_fee', 0)
      .eq('attendance_fee_verified', false)
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

export const verifyAttendanceFee = async (enrollmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ attendance_fee_verified: true })
    .eq('id', enrollmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getAccountsVerifiedFees = async () => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .select('*, profiles!subject_enrollment_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
      .gt('attendance_fee', 0)
      .eq('attendance_fee_verified', true)
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

// =======================
// ATTENDANCE FINE CATEGORIES
// =======================
export const getAttendanceCategories = async (departmentId: string) => {
  const { data, error } = await supabase
    .from('attendance_fine_categories')
    .select('*')
    .eq('department_id', departmentId)
    .order('min_pct', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createAttendanceCategory = async (departmentId: string, label: string, minPct: number, maxPct: number, amount: number, isFirstYear: boolean = false) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('attendance_fine_categories')
    .insert([{ department_id: departmentId, label, min_pct: minPct, max_pct: maxPct, fine_amount: amount, created_by: user?.id, is_first_year: isFirstYear }])
    .select()
    .single();
  if (error) throw error;
  logActivity('Created Fine Category', `${label}: ${minPct}%-${maxPct}% → ₹${amount}`);
  return data;
};

export const updateAttendanceCategory = async (id: string, label: string, minPct: number, maxPct: number, amount: number) => {
  const { data, error } = await supabase
    .from('attendance_fine_categories')
    .update({ label, min_pct: minPct, max_pct: maxPct, fine_amount: amount, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  logActivity('Updated Fine Category', `${label}: ${minPct}%-${maxPct}% → ₹${amount}`);
  return data;
};

export const deleteAttendanceCategory = async (id: string) => {
  const { error } = await supabase
    .from('attendance_fine_categories')
    .delete()
    .eq('id', id);
  if (error) throw error;
  logActivity('Deleted Fine Category', `Removed category ${id}`);
};

export const applyMassFines = async (departmentId: string, isFirstYear: boolean) => {
  const categories = await getAttendanceCategories(departmentId);
  if (categories.length === 0) throw new Error('No attendance fine categories configured. Please create categories first.');
  const { data, error } = await supabase.rpc('rpc_apply_mass_fines', {
    p_department_id: departmentId,
    p_is_first_year: isFirstYear,
  });
  if (error) throw error;
  const result = data as { updated?: number; skipped?: number; total?: number } | null;
  return { updated: result?.updated || 0, skipped: result?.skipped || 0, total: result?.total || 0 };
};

export const reduceStudentFine = async (enrollmentId: string, newAmount: number) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ attendance_fee: newAmount, attendance_fee_verified: false })
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(subject_name)')
    .single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  const subjName = (data)?.subjects?.subject_name || 'subject';
  logActivity('Reduced Fine', `Set fine to ₹${newAmount} for ${studentName} in ${subjName}`);
  return data;
};

export const clearStudentFine = async (enrollmentId: string) => {
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ attendance_fee_verified: true, status: 'completed' })
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(subject_name)')
    .single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  const subjName = (data)?.subjects?.subject_name || 'subject';
  logActivity('Cleared Fine', `Manually cleared fine (cash payment) for ${studentName} in ${subjName}`);
  return data;
};

export const setAttendanceDue = async (studentId: string, subjectId: string, feeAmount: number) => {
  const { data: existing } = await supabase
    .from('subject_enrollment')
    .select('id')
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
    .single();
  if (existing) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .update({ attendance_fee: feeAmount, attendance_fee_verified: false, status: 'rejected' })
      .eq('id', existing.id)
      .select('*, profiles!subject_enrollment_student_id_fkey(full_name), subjects!subject_enrollment_subject_id_fkey(subject_name)')
      .single();
    if (error) throw error;
    const studentName = data?.profiles?.full_name || 'student';
    const subjName = (data)?.subjects?.subject_name || 'subject';
    logActivity('Assigned Attendance Due', `Staff set ₹${feeAmount} fine for ${studentName} in ${subjName}`);
    return data;
  } else {
    throw new Error("Student is not enrolled in this subject.");
  }
};

export const bulkSetAttendanceDuesCSV = async (departmentId: string | undefined, rows: { roll_number: string; subject_code: string; amount: number }[]) => {
  if (!departmentId) throw new Error('Department ID is required');
  const { data, error } = await supabase.rpc('bulk_set_attendance_dues', {
    p_department_id: departmentId,
    p_rows: rows,
  });
  if (error) throw error;
  const result = data as { updated?: number; errors?: string[] } | null;
  const updated = result?.updated || 0;
  const errors = result?.errors || [];
  if (updated > 0) logActivity('Bulk Attendance Dues', `Assigned attendance fines for ${updated} students.`);
  return { updated, errors };
};

export const getStaffAttendanceFines = async (departmentId: string) => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .select('*, profiles!subject_enrollment_student_id_fkey!inner(full_name, roll_number, section, department_id, semester_id, semesters(name)), subjects!subject_enrollment_subject_id_fkey(subject_name, subject_code)')
      .eq('status', 'rejected')
      .eq('profiles.department_id', departmentId)
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

export const overrideAttendanceFine = async (enrollmentId: string, feeAmount: number = 0) => {
  const newStatus = feeAmount === 0 ? 'completed' : 'rejected';
  const remarks = feeAmount === 0 ? 'Approved by Staff (Fine Waived)' : 'Fine Reduced by Staff';
  const { data, error } = await supabase
    .from('subject_enrollment')
    .update({ status: newStatus, remarks, attendance_fee: feeAmount })
    .eq('id', enrollmentId)
    .select('*, profiles!subject_enrollment_student_id_fkey(full_name)')
    .single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  logActivity('Staff Approved Fine', `Override and cleared attendance for ${studentName} with fee: ₹${feeAmount}`);
  return data;
};
