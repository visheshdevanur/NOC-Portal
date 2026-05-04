-- 0073_fix_tenant_isolation_restrictive.sql
-- Fix: Make tenant isolation policies RESTRICTIVE so they are AND'd
-- with existing permissive policies. This ensures no cross-tenant data leaks.

-- ============================================================
-- Drop the old PERMISSIVE tenant isolation policies
-- ============================================================
DROP POLICY IF EXISTS "tenant_isolation_profiles" ON profiles;
DROP POLICY IF EXISTS "tenant_isolation_departments" ON departments;
DROP POLICY IF EXISTS "tenant_isolation_semesters" ON semesters;
DROP POLICY IF EXISTS "tenant_isolation_subjects" ON subjects;
DROP POLICY IF EXISTS "tenant_isolation_subject_enrollment" ON subject_enrollment;
DROP POLICY IF EXISTS "tenant_isolation_clearance_requests" ON clearance_requests;
DROP POLICY IF EXISTS "tenant_isolation_student_dues" ON student_dues;
DROP POLICY IF EXISTS "tenant_isolation_library_dues" ON library_dues;
DROP POLICY IF EXISTS "tenant_isolation_ia_attendance" ON ia_attendance;
DROP POLICY IF EXISTS "tenant_isolation_activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "tenant_isolation_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "tenant_isolation_notifications" ON notifications;
DROP POLICY IF EXISTS "tenant_isolation_hall_ticket_templates" ON hall_ticket_templates;

-- ============================================================
-- Re-create as RESTRICTIVE policies (AND'd with existing policies)
-- This means: existing role-based policies AND tenant match must BOTH be true
-- ============================================================

CREATE POLICY "tenant_isolation_profiles" ON profiles
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_departments" ON departments
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_semesters" ON semesters
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_subjects" ON subjects
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_subject_enrollment" ON subject_enrollment
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_clearance_requests" ON clearance_requests
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_student_dues" ON student_dues
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_library_dues" ON library_dues
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_ia_attendance" ON ia_attendance
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_activity_logs" ON activity_logs
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_audit_logs" ON audit_logs
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_notifications" ON notifications
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_isolation_hall_ticket_templates" ON hall_ticket_templates
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id());
