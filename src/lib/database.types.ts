export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          department_id: string | null
          details: string | null
          id: string
          tenant_id: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string
          department_id?: string | null
          details?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          department_id?: string | null
          details?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_fine_categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          department_id: string
          fine_amount: number
          id: string
          is_first_year: boolean
          label: string
          max_pct: number
          min_pct: number
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          department_id: string
          fine_amount?: number
          id?: string
          is_first_year?: boolean
          label: string
          max_pct: number
          min_pct: number
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          department_id?: string
          fine_amount?: number
          id?: string
          is_first_year?: boolean
          label?: string
          max_pct?: number
          min_pct?: number
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_fine_categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_fine_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string | null
          id: string
          remarks: string | null
          stage: Database["public"]["Enums"]["clearance_stage"]
          student_id: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string | null
          id?: string
          remarks?: string | null
          stage: Database["public"]["Enums"]["clearance_stage"]
          student_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string | null
          id?: string
          remarks?: string | null
          stage?: Database["public"]["Enums"]["clearance_stage"]
          student_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clearance_master: {
        Row: {
          hod_approved: boolean | null
          id: string
          status: Database["public"]["Enums"]["clearance_status"] | null
          student_id: string
        }
        Insert: {
          hod_approved?: boolean | null
          id?: string
          status?: Database["public"]["Enums"]["clearance_status"] | null
          student_id: string
        }
        Update: {
          hod_approved?: boolean | null
          id?: string
          status?: Database["public"]["Enums"]["clearance_status"] | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clearance_master_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clearance_requests: {
        Row: {
          created_at: string | null
          current_stage: Database["public"]["Enums"]["clearance_stage"] | null
          id: string
          remarks: string | null
          status: Database["public"]["Enums"]["clearance_status"] | null
          student_id: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_stage?: Database["public"]["Enums"]["clearance_stage"] | null
          id?: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["clearance_status"] | null
          student_id: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_stage?: Database["public"]["Enums"]["clearance_stage"] | null
          id?: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["clearance_status"] | null
          student_id?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clearance_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clearance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          hod_id: string | null
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          hod_id?: string | null
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          hod_id?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_hod_id_fkey"
            columns: ["hod_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_attendance: {
        Row: {
          created_at: string | null
          ia_number: number
          id: string
          is_present: boolean
          student_id: string
          subject_id: string
          teacher_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          ia_number: number
          id?: string
          is_present?: boolean
          student_id: string
          subject_id: string
          teacher_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          ia_number?: number
          id?: string
          is_present?: boolean
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_attendance_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_teachers: {
        Row: {
          created_at: string | null
          created_by: string | null
          department_id: string
          id: string
          teacher_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          department_id: string
          id?: string
          teacher_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          department_id?: string
          id?: string
          teacher_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imported_teachers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_teachers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      library_dues: {
        Row: {
          created_at: string | null
          fine_amount: number | null
          has_dues: boolean | null
          id: string
          paid_amount: number | null
          permitted: boolean | null
          remarks: string | null
          student_id: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fine_amount?: number | null
          has_dues?: boolean | null
          id?: string
          paid_amount?: number | null
          permitted?: boolean | null
          remarks?: string | null
          student_id: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fine_amount?: number | null
          has_dues?: boolean | null
          id?: string
          paid_amount?: number | null
          permitted?: boolean | null
          remarks?: string | null
          student_id?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_dues_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_dues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          tenant_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          tenant_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          tenant_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_error_logs: {
        Row: {
          created_at: string
          dashboard_name: string
          error_code: string
          error_detail: string
          id: string
          nav_path: string | null
          severity: string
          tenant_id: string | null
          tenant_name: string | null
          triggered_by_email: string | null
          triggered_by_role: string | null
        }
        Insert: {
          created_at?: string
          dashboard_name: string
          error_code: string
          error_detail: string
          id?: string
          nav_path?: string | null
          severity?: string
          tenant_id?: string | null
          tenant_name?: string | null
          triggered_by_email?: string | null
          triggered_by_role?: string | null
        }
        Update: {
          created_at?: string
          dashboard_name?: string
          error_code?: string
          error_detail?: string
          id?: string
          nav_path?: string | null
          severity?: string
          tenant_id?: string | null
          tenant_name?: string | null
          triggered_by_email?: string | null
          triggered_by_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_error_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          batch: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          email: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          roll_number: string | null
          section: string | null
          semester_id: string | null
          status: string | null
          tenant_id: string | null
          theme: string | null
        }
        Insert: {
          avatar_url?: string | null
          batch?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          email?: string | null
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          roll_number?: string | null
          section?: string | null
          semester_id?: string | null
          status?: string | null
          tenant_id?: string | null
          theme?: string | null
        }
        Update: {
          avatar_url?: string | null
          batch?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          roll_number?: string | null
          section?: string | null
          semester_id?: string | null
          status?: string | null
          tenant_id?: string | null
          theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          created_at: string | null
          department_id: string
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          department_id: string
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "semesters_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semesters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_dues: {
        Row: {
          fine_amount: number | null
          id: string
          paid_amount: number | null
          permitted_until: string | null
          status: string | null
          student_id: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          fine_amount?: number | null
          id?: string
          paid_amount?: number | null
          permitted_until?: string | null
          status?: string | null
          student_id: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          fine_amount?: number | null
          id?: string
          paid_amount?: number | null
          permitted_until?: string | null
          status?: string | null
          student_id?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_dues_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_dues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_enrollment: {
        Row: {
          attendance_fee: number | null
          attendance_fee_verified: boolean | null
          attendance_pct: number | null
          id: string
          is_faculty_cleared: boolean | null
          payment_date: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["clearance_status"] | null
          student_id: string
          subject_id: string
          teacher_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          attendance_fee?: number | null
          attendance_fee_verified?: boolean | null
          attendance_pct?: number | null
          id?: string
          is_faculty_cleared?: boolean | null
          payment_date?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["clearance_status"] | null
          student_id: string
          subject_id: string
          teacher_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          attendance_fee?: number | null
          attendance_fee_verified?: boolean | null
          attendance_pct?: number | null
          id?: string
          is_faculty_cleared?: boolean | null
          payment_date?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["clearance_status"] | null
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subject_enrollment_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_enrollment_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_enrollment_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_enrollment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          department_id: string | null
          exam_date: string | null
          exam_time: string | null
          id: string
          semester_id: string
          subject_code: string
          subject_name: string
          tenant_id: string | null
        }
        Insert: {
          department_id?: string | null
          exam_date?: string | null
          exam_time?: string | null
          id?: string
          semester_id: string
          subject_code: string
          subject_name: string
          tenant_id?: string | null
        }
        Update: {
          department_id?: string | null
          exam_date?: string | null
          exam_time?: string | null
          id?: string
          semester_id?: string
          subject_code?: string
          subject_name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          admin_email: string
          created_at: string | null
          id: string
          logo_url: string | null
          max_users: number | null
          name: string
          plan: string | null
          primary_color: string | null
          slug: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_email: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          max_users?: number | null
          name: string
          plan?: string | null
          primary_color?: string | null
          slug: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_email?: string
          created_at?: string | null
          id?: string
          logo_url?: string | null
          max_users?: number | null
          name?: string
          plan?: string | null
          primary_color?: string | null
          slug?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      admin_update_user_credentials: {
        Args: {
          new_email: string
          new_password?: string
          target_user_id: string
        }
        Returns: undefined
      }
      advance_clearance_stage: {
        Args: { p_action: string; p_request_id: string }
        Returns: Json
      }
      assign_teacher_to_section_rpc: {
        Args: {
          p_section: string
          p_semester_id: string
          p_subject_id: string
          p_teacher_id: string
        }
        Returns: Json
      }
      export_pre_promotion_data: { Args: never; Returns: Json }
      get_my_tenant_id: { Args: never; Returns: string }
      log_platform_error: {
        Args: {
          p_dashboard_name: string
          p_error_code: string
          p_error_detail: string
          p_nav_path: string
          p_severity: string
          p_tenant_id: string
          p_tenant_name: string
          p_triggered_email?: string
          p_triggered_role?: string
        }
        Returns: undefined
      }
      process_payment_webhook: {
        Args: {
          p_amount_paid: number
          p_razorpay_order_id: string
          p_razorpay_payment_id: string
        }
        Returns: Json
      }
      promote_all_students: { Args: never; Returns: Json }
      promote_students_to_semester: {
        Args: {
          p_department_id: string
          p_source_semester_id: string
          p_target_semester_id: string
        }
        Returns: number
      }
    }
    Enums: {
      audit_action:
        | "created"
        | "updated"
        | "approved"
        | "rejected"
        | "escalated"
      clearance_stage:
        | "student_application"
        | "faculty_review"
        | "library_review"
        | "accounts_review"
        | "department_review"
        | "hod_review"
        | "cleared"
        | "rejected"
      clearance_status: "pending" | "rejected" | "completed"
      dept_type: "library" | "hostel" | "accounts"
      notification_type: "info" | "success" | "warning" | "error"
      user_role:
        | "student"
        | "faculty"
        | "staff"
        | "hod"
        | "admin"
        | "teacher"
        | "accounts"

        | "principal"
        | "librarian"
        | "fyc"
        | "clerk"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: ["created", "updated", "approved", "rejected", "escalated"],
      clearance_stage: [
        "student_application",
        "faculty_review",
        "library_review",
        "accounts_review",
        "department_review",
        "hod_review",
        "cleared",
        "rejected",
      ],
      clearance_status: ["pending", "rejected", "completed"],
      dept_type: ["library", "hostel", "accounts"],
      notification_type: ["info", "success", "warning", "error"],
      user_role: [
        "student",
        "faculty",
        "staff",
        "hod",
        "admin",
        "teacher",
        "accounts",

        "principal",
        "librarian",
        "fyc",
        "clerk",
      ],
    },
  },
} as const
