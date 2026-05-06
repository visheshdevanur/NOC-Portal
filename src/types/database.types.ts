export type Role = 'student' | 'faculty' | 'teacher' | 'staff' | 'clerk' | 'hod' | 'admin' | 'accounts' | 'principal' | 'librarian' | 'fyc';
export type DeptType = 'library' | 'hostel' | 'accounts';
export type ClearanceStatus = 'pending' | 'rejected' | 'completed';
export type ClearanceStage = 'student_application' | 'faculty_review' | 'library_review' | 'department_review' | 'hod_review' | 'cleared' | 'rejected';
export type AuditAction = 'created' | 'updated' | 'approved' | 'rejected' | 'escalated';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: Role;
          roll_number: string | null;
          department_id: string | null;
          semester_id: string | null;
          section: string | null;
          avatar_url: string | null;
          theme: string | null;
          status: string | null;
          batch: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: { id: string; full_name: string; role?: Role; roll_number?: string | null; department_id?: string | null; semester_id?: string | null; section?: string | null; avatar_url?: string | null; theme?: string | null; status?: string | null; batch?: string | null; created_at?: string; created_by?: string | null };
        Update: { id?: string; full_name?: string; role?: Role; roll_number?: string | null; department_id?: string | null; semester_id?: string | null; section?: string | null; avatar_url?: string | null; theme?: string | null; status?: string | null; batch?: string | null; created_at?: string; created_by?: string | null };
      };
      subjects: {
        Row: {
          id: string;
          subject_name: string;
          subject_code: string;
          department_id: string | null;
          semester_id: string | null;
          exam_date: string | null;
          exam_time: string | null;
        };
        Insert: { id?: string; subject_name: string; subject_code: string; department_id?: string | null; semester_id?: string | null; exam_date?: string | null; exam_time?: string | null };
        Update: { id?: string; subject_name?: string; subject_code?: string; department_id?: string | null; semester_id?: string | null; exam_date?: string | null; exam_time?: string | null };
      };
      subject_enrollment: {
        Row: {
          id: string;
          student_id: string;
          subject_id: string;
          teacher_id: string | null;
          attendance_pct: number | null;
          status: ClearanceStatus;
          remarks: string | null;
          attendance_fee: number;
          attendance_fee_verified: boolean;
          updated_at: string;
        };
        Insert: { id?: string; student_id: string; subject_id: string; teacher_id?: string | null; attendance_pct?: number | null; status?: ClearanceStatus; remarks?: string | null; attendance_fee?: number; attendance_fee_verified?: boolean; updated_at?: string };
        Update: { status?: ClearanceStatus; remarks?: string | null; id?: string; student_id?: string; subject_id?: string; teacher_id?: string | null; attendance_pct?: number | null; attendance_fee?: number; attendance_fee_verified?: boolean; updated_at?: string };
      };
      department_dues: {
        Row: { id: string; student_id: string; department_id: string; is_dept_cleared: boolean; fine_amount: number; created_at: string; updated_at: string; remarks: string | null };
        Insert: { id?: string; student_id: string; department_id: string; is_dept_cleared?: boolean; fine_amount?: number; created_at?: string; updated_at?: string; remarks?: string | null };
        Update: { id?: string; student_id?: string; department_id?: string; is_dept_cleared?: boolean; fine_amount?: number; created_at?: string; updated_at?: string; remarks?: string | null };
      };
      student_dues: {
        Row: { id: string; student_id: string; has_dues: boolean; due_amount: number; remarks: string | null; last_updated_by: string | null; updated_at: string; created_at: string };
        Insert: { id?: string; student_id: string; has_dues?: boolean; due_amount?: number; remarks?: string | null; last_updated_by?: string | null; updated_at?: string; created_at?: string };
        Update: { id?: string; student_id?: string; has_dues?: boolean; due_amount?: number; remarks?: string | null; last_updated_by?: string | null; updated_at?: string; created_at?: string };
      };
      library_dues: {
        Row: { id: string; student_id: string; has_dues: boolean; fine_amount: number; remarks: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; student_id: string; has_dues?: boolean; fine_amount?: number; remarks?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; student_id?: string; has_dues?: boolean; fine_amount?: number; remarks?: string | null; created_at?: string; updated_at?: string };
      };

      clearance_requests: {
        Row: {
          id: string;
          student_id: string;
          current_stage: ClearanceStage;
          status: ClearanceStatus;
          remarks: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; student_id: string; current_stage?: ClearanceStage; status?: ClearanceStatus; remarks?: string | null; created_at?: string; updated_at?: string };
        Update: { current_stage?: ClearanceStage; status?: ClearanceStatus; remarks?: string | null; id?: string; student_id?: string; created_at?: string; updated_at?: string };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          student_id: string;
          action: AuditAction;
          stage: ClearanceStage;
          remarks: string | null;
          created_at: string;
        };
        Insert: { id?: string; user_id?: string | null; student_id: string; action: AuditAction; stage: ClearanceStage; remarks?: string | null; created_at?: string };
        Update: { id?: string; user_id?: string | null; student_id?: string; action?: AuditAction; stage?: ClearanceStage; remarks?: string | null; created_at?: string };
      };
      activity_logs: {
        Row: {
          id: string;
          user_id: string | null;
          user_role: string | null;
          department_id: string | null;
          user_name: string | null;
          action: string;
          details: string | null;
          created_at: string;
        };
        Insert: { id?: string; user_id?: string | null; user_role?: string | null; department_id?: string | null; user_name?: string | null; action: string; details?: string | null; created_at?: string };
        Update: { id?: string; user_id?: string | null; user_role?: string | null; department_id?: string | null; user_name?: string | null; action?: string; details?: string | null; created_at?: string };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: NotificationType;
          is_read: boolean;
          created_at: string;
        };
        Insert: { id?: string; user_id: string; title: string; message: string; type?: NotificationType; is_read?: boolean; created_at?: string };
        Update: { id?: string; user_id?: string; title?: string; message?: string; type?: NotificationType; is_read?: boolean; created_at?: string };
      };
      ia_attendance: {
        Row: {
          id: string;
          student_id: string;
          subject_id: string;
          teacher_id: string | null;
          ia_number: number;
          is_present: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; student_id: string; subject_id: string; teacher_id?: string | null; ia_number: number; is_present?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; student_id?: string; subject_id?: string; teacher_id?: string | null; ia_number?: number; is_present?: boolean; created_at?: string; updated_at?: string };
      };
      departments: {
        Row: {
          id: string;
          name: string;
          hod_id: string | null;
          created_at: string;
        };
        Insert: { id?: string; name: string; hod_id?: string | null; created_at?: string };
        Update: { id?: string; name?: string; hod_id?: string | null; created_at?: string };
      };
    };
  };
}
