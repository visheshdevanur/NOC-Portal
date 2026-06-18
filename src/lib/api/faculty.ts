import { supabase } from '../supabase';
import { logActivity } from './shared';
import { sanitizeRemarks, sanitizeNumber } from '../sanitize';

// =======================
// FACULTY SPECIFIC
// =======================

/**
 * Fetch ALL subject_enrollment rows for a faculty member.
 *
 * Supabase PostgREST defaults to a 1 000-row page limit.
 * For faculty teaching large cohorts (3 000+ students) we must paginate
 * through every page and concatenate the results.
 */
export const getFacultyPendingStudents = async (facultyId: string) => {
  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .select(
        '*, ' +
        'profiles!subject_enrollment_student_id_fkey(' +
          'full_name, section, semester_id, roll_number, department_id, ' +
          'semesters(name), ' +
          'departments!profiles_department_id_fkey(name)' +
        '), ' +
        'subjects(*, departments!subjects_department_id_fkey(name))',
      )
      .eq('teacher_id', facultyId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break; // reached the last page
    from += PAGE_SIZE;
  }

  return allData;
};

export const markFacultySubjectStatus = async (
  enrollmentId: string,
  status: string,
  attendancePct: number,
  remarks: string,
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

/**
 * High-performance batch attendance update for bulk CSV/Excel uploads.
 *
 * Key optimisations vs the single-row version:
 *  - getUser() is called ONCE for the whole batch (not once per student)
 *  - logActivity() is called ONCE at the end (not once per student)
 *  - Updates run in parallel chunks of CONCURRENCY (default 50) instead of 20
 *  - No redundant .select() on each update (write-only, faster)
 */
export const batchMarkFacultyAttendance = async (
  updates: {
    enrollmentId: string;
    status: string;
    attendancePct: number;
    remarks: string;
  }[],
): Promise<{ updated: number; errors: number }> => {
  if (updates.length === 0) return { updated: 0, errors: 0 };

  // One auth call for the entire batch
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const CONCURRENCY = 50;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async ({ enrollmentId, status, attendancePct, remarks }) => {
        // Inline sanitise (avoids extra function call overhead)
        const pct = Math.min(100, Math.max(0, Math.round(Number(attendancePct) || 0)));
        const safeRemarks = (remarks || '').slice(0, 500);
        let finalStatus = status;
        let finalRemarks = safeRemarks;

        if (pct < 85 && finalStatus === 'completed') {
          finalStatus = 'rejected';
          finalRemarks = finalRemarks || 'Low Attendance (<85%)';
        }

        const payload: any = {
          status: finalStatus,
          attendance_pct: pct,
          remarks: finalRemarks,
        };
        if (finalStatus === 'completed') {
          payload.attendance_fee = 0;
          payload.attendance_fee_verified = false;
        }

        const { error } = await supabase
          .from('subject_enrollment')
          .update(payload)
          .eq('id', enrollmentId)
          .eq('teacher_id', user.id); // RLS + ownership check

        if (error) throw error;
      }),
    );

    updated += results.filter(r => r.status === 'fulfilled').length;
    errors  += results.filter(r => r.status === 'rejected').length;
  }

  // Single audit-log entry for the whole bulk operation
  if (updated > 0) {
    logActivity(
      'Bulk Attendance Update',
      `Updated attendance for ${updated} students via template upload`,
    );
  }

  return { updated, errors };
};

// =======================
// IA ATTENDANCE
// =======================

/**
 * Fetch distinct subjects assigned to a teacher.
 * Uses pagination to handle teachers with large enrolment counts.
 */
export const getTeacherSubjectsList = async (teacherId: string) => {
  const PAGE_SIZE = 1000;
  const allData: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('subject_enrollment')
      .select(
        'subject_id, subjects!subject_enrollment_subject_id_fkey(' +
          'id, subject_name, subject_code, semester_id, department_id, ' +
          'semesters(name), ' +
          'departments!subjects_department_id_fkey(name)' +
        ')',
      )
      .eq('teacher_id', teacherId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const subjectMap = new Map();
  allData.forEach((row: any) => {
    if (row.subjects && !subjectMap.has(row.subject_id)) {
      subjectMap.set(row.subject_id, row.subjects);
    }
  });
  return Array.from(subjectMap.values());
};

export const getIACountForSubject = async (subjectId: string, _teacherId: string, section?: string | null) => {
  // Use edge function to bypass RLS — so COE-uploaded IA records are visible
  const { data, error } = await supabase.functions.invoke('admin-api', {
    body: { action: 'get-ia-data', subject_id: subjectId, section: section || undefined },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const records = data?.data || [];
  if (records.length === 0) return 0;
  // Find the max ia_number
  let maxIA = 0;
  records.forEach((r: any) => { if (r.ia_number > maxIA) maxIA = r.ia_number; });
  return maxIA;
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

/**
 * Fetch IA attendance for multiple subjects IN PARALLEL.
 *
 * Previous implementation looped sequentially (one edge-function call per
 * subject) which was very slow for teachers with many subjects.
 * Now all invocations fire at the same time with Promise.allSettled.
 */
export const getTeacherIAAttendance = async (_teacherId: string, subjectIds?: string[]) => {
  if (!subjectIds || subjectIds.length === 0) return [];

  // All edge-function calls in parallel
  const settled = await Promise.allSettled(
    subjectIds.map(subjectId =>
      supabase.functions.invoke('admin-api', {
        body: { action: 'get-ia-data', subject_id: subjectId },
      }),
    ),
  );

  const allRecords: any[] = [];
  settled.forEach((result, idx) => {
    if (result.status === 'rejected') {
      console.error('Error fetching IA for subject', subjectIds[idx], result.reason);
      return;
    }
    const { data, error } = result.value;
    if (error || data?.error) {
      console.error('Edge fn error for subject', subjectIds[idx], error || data.error);
      return;
    }
    (data?.data || []).forEach((r: any) => {
      allRecords.push({
        student_id: r.student_id,
        subject_id: r.subject_id,
        ia_number:  r.ia_number,
        is_present: r.is_present,
      });
    });
  });

  return allRecords;
};
