import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// LIBRARY DUES MANAGEMENT
// =======================
export const getLibraryDues = async () => {
  // First, ensure every student has a library_dues record
  const { data: allStudents } = await supabase.from('profiles').select('id').eq('role', 'student');
  if (allStudents && allStudents.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < allStudents.length; i += BATCH) {
      const batch = allStudents.slice(i, i + BATCH).map(s => ({ student_id: s.id, has_dues: false, fine_amount: 0 }));
      await supabase.from('library_dues').upsert(batch, { onConflict: 'student_id', ignoreDuplicates: true });
    }
  }

  // Now fetch all library dues with profile data
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('library_dues').select('*, profiles!library_dues_student_id_fkey(full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name))').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
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
