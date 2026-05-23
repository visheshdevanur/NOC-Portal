import { supabase } from '../supabase';
import { logActivity } from './shared';

// =======================
// LIBRARY DUES MANAGEMENT
// =======================
export const getLibraryDues = async () => {
  const PAGE_SIZE = 1000;

  const fetchAll = async (table: string, select: string, filters?: (q: any) => any) => {
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
    fetchAll('profiles', 'id, full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)', q => q.eq('role', 'student').order('roll_number')),
    fetchAll('library_dues', 'student_id, has_dues, fine_amount, paid_amount, remarks, permitted, updated_at', q => q.order('student_id')),
  ]);

  // Build a map of student_id -> dues
  const duesMap = new Map(allDues.map(d => [d.student_id, d]));

  // Merge: every student gets a record
  return allStudents.map(student => {
    const dues = duesMap.get(student.id);
    return {
      id: dues?.student_id || student.id,
      student_id: student.id,
      has_dues: dues?.has_dues ?? false,
      fine_amount: dues?.fine_amount ?? 0,
      paid_amount: dues?.paid_amount ?? 0,
      remarks: dues?.remarks ?? null,
      permitted: dues?.permitted ?? false,
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
  // First ensure a row exists via upsert
  await supabase.from('library_dues').upsert({ student_id: studentId, has_dues: true, permitted: false }, { onConflict: 'student_id' });
  const { data, error } = await supabase.from('library_dues').select('*, profiles!library_dues_student_id_fkey(full_name)').eq('student_id', studentId).limit(1).maybeSingle();
  if (error) throw error;
  logActivity('Set Library Due', `Blocked ${data?.profiles?.full_name || 'student'}`);
  return data;
};

export const permitLibraryDue = async (studentId: string) => {
  const { error: upErr } = await supabase.from('library_dues').update({ permitted: true }).eq('student_id', studentId);
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('library_dues').select('*, profiles!library_dues_student_id_fkey(full_name)').eq('student_id', studentId).limit(1).maybeSingle();
  if (error) throw error;
  logActivity('Permitted Library Due', `Permitted clearance for ${data?.profiles?.full_name || 'student'}`);
  return data;
};

export const clearLibraryDue = async (studentId: string) => {
  const { error: upErr } = await supabase.from('library_dues').update({ has_dues: false, permitted: false, fine_amount: 0, paid_amount: 0, remarks: null }).eq('student_id', studentId);
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('library_dues').select('*, profiles!library_dues_student_id_fkey(full_name)').eq('student_id', studentId).limit(1).maybeSingle();
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
