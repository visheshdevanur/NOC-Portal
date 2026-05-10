import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// LIBRARY DUES MANAGEMENT
// =======================
export const getLibraryDues = async () => {
  // Supabase server returns max 1000 rows per request. Loop pages through ALL records.
  const PAGE_SIZE = 1000;
  let allStudents: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)')
      .eq('role', 'student')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allStudents = allStudents.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Fetch all existing library_dues records
  let allDues: any[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('library_dues')
      .select('student_id, has_dues, fine_amount, paid_amount, remarks, updated_at')
      .order('student_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allDues = allDues.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Build a map of student_id -> dues
  const duesMap = new Map(allDues.map(d => [d.student_id, d]));

  // Merge: every student gets a record, whether or not they have library dues
  return allStudents.map(student => {
    const dues = duesMap.get(student.id);
    return {
      id: dues?.student_id || student.id,
      student_id: student.id,
      has_dues: dues?.has_dues ?? false,
      fine_amount: dues?.fine_amount ?? 0,
      paid_amount: dues?.paid_amount ?? 0,
      remarks: dues?.remarks ?? null,
      updated_at: dues?.updated_at ?? null,
      profiles: student,
    };
  });
};

export const updateLibraryDue = async (studentId: string, hasDues: boolean, fineAmount: number, paidAmount: number = 0, remarks: string) => {
  const { data, error } = await supabase.from('library_dues').upsert({ student_id: studentId, has_dues: hasDues, fine_amount: fineAmount, paid_amount: paidAmount, remarks }, { onConflict: 'student_id' }).select('*, profiles!library_dues_student_id_fkey(full_name)').single();
  if (error) throw error;
  const studentName = data?.profiles?.full_name || 'student';
  logActivity(hasDues ? 'Assigned Library Fine' : 'Cleared Library Fine', `Amount: ₹${fineAmount} for ${studentName}`);
  return data;
};

export const setLibraryDue = async (studentId: string) => {
  const { data, error } = await supabase.from('library_dues').update({ has_dues: true, permitted: false }).eq('student_id', studentId).select('*, profiles!library_dues_student_id_fkey(full_name)').single();
  if (error) throw error;
  logActivity('Set Library Due', `Blocked ${data?.profiles?.full_name || 'student'}`);
  return data;
};

export const permitLibraryDue = async (studentId: string) => {
  const { data, error } = await supabase.from('library_dues').update({ permitted: true }).eq('student_id', studentId).select('*, profiles!library_dues_student_id_fkey(full_name)').single();
  if (error) throw error;
  logActivity('Permitted Library Due', `Permitted clearance for ${data?.profiles?.full_name || 'student'}`);
  return data;
};

export const clearLibraryDue = async (studentId: string) => {
  const { data, error } = await supabase.from('library_dues').update({ has_dues: false, permitted: false, fine_amount: 0, paid_amount: 0, remarks: null }).eq('student_id', studentId).select('*, profiles!library_dues_student_id_fkey(full_name)').single();
  if (error) throw error;
  logActivity('Cleared Library Due', `Cleared dues for ${data?.profiles?.full_name || 'student'}`);
  return data;
};

export const bulkProcessLibraryDues = async (notPaidRolls: string[]) => {
  const { data, error } = await supabase.rpc('bulk_process_library_dues', { p_not_paid_rolls: notPaidRolls.map(r => r.trim()) });
  if (error) throw error;
  const result = data as { not_paid?: number; cleared?: number } | null;
  logActivity('Bulk Processed Library Dues', `${result?.not_paid || 0} not paid, ${result?.cleared || 0} auto-cleared`);
  return result?.not_paid || 0;
};
