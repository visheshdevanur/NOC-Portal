import { supabase } from '../supabase';

// =======================
// AICTE CLEARANCE API
// =======================

export type AicteClearance = {
  id: string | null;
  student_id: string;
  status: 'not_submitted' | 'submitted' | 'permitted';
  updated_by: string | null;
  updated_at: string | null;
  profiles: {
    full_name: string;
    section?: string;
    roll_number?: string;
    department_id?: string;
    departments?: { name: string } | null;
    semester_id?: string;
    semesters?: { name: string } | null;
  } | null;
};

/** Fetch all students with AICTE clearance status (for AICTE dashboard) */
export const getAllAicteClearances = async (): Promise<AicteClearance[]> => {
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

  // Fetch students and AICTE records in parallel
  const [allStudents, allRecords] = await Promise.all([
    fetchAllPaged('profiles',
      'id, full_name, section, roll_number, department_id, departments!profiles_department_id_fkey(name), semester_id, semesters!profiles_semester_id_fkey(name)',
      q => q.eq('role', 'student').order('roll_number')
    ),
    fetchAllPaged('aicte_clearance', 'id, student_id, status, updated_by, updated_at'),
  ]);

  // Build map
  const recordMap = new Map(allRecords.map((r: any) => [r.student_id, r]));

  // Merge: every student gets a record (default = not_submitted)
  return allStudents.map(student => {
    const record = recordMap.get(student.id);
    return {
      id: record?.id || null,
      student_id: student.id,
      status: record?.status ?? 'not_submitted',
      updated_by: record?.updated_by ?? null,
      updated_at: record?.updated_at ?? null,
      profiles: student,
    };
  });
};

/** Update single student AICTE status */
export const updateAicteStatus = async (
  studentId: string,
  status: 'not_submitted' | 'submitted' | 'permitted',
  updatedBy: string,
  tenantId: string | null,
) => {
  // Use RPC for upsert to bypass RLS
  const { data, error } = await supabase.rpc('aicte_bulk_upsert', {
    p_rows: [{
      student_id: studentId,
      status,
      updated_by: updatedBy,
      tenant_id: tenantId,
    }],
  });
  if (error) throw error;
  return data;
};

/** Get AICTE status for a single student (for student dashboard) */
export const getStudentAicteStatus = async (studentId: string) => {
  const { data, error } = await supabase
    .from('aicte_clearance')
    .select('id, student_id, status, updated_at')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data?.status || 'not_submitted';
};
