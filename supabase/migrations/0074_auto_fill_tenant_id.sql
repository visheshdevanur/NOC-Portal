-- 0074_auto_fill_tenant_id.sql
-- Auto-fill tenant_id on INSERT for all tables so existing code
-- that doesn't set tenant_id continues to work.

-- ============================================================
-- 1. Create a trigger function that auto-sets tenant_id
-- ============================================================
CREATE OR REPLACE FUNCTION auto_set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If tenant_id is already set, keep it (e.g. super admin provisioning)
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Otherwise, inherit from the current user's profile
  NEW.tenant_id := (SELECT tenant_id FROM profiles WHERE id = auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Attach the trigger to all tables with tenant_id
-- ============================================================

-- profiles
DROP TRIGGER IF EXISTS trg_auto_tenant_profiles ON profiles;
CREATE TRIGGER trg_auto_tenant_profiles
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- departments
DROP TRIGGER IF EXISTS trg_auto_tenant_departments ON departments;
CREATE TRIGGER trg_auto_tenant_departments
  BEFORE INSERT ON departments
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- semesters
DROP TRIGGER IF EXISTS trg_auto_tenant_semesters ON semesters;
CREATE TRIGGER trg_auto_tenant_semesters
  BEFORE INSERT ON semesters
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- subjects
DROP TRIGGER IF EXISTS trg_auto_tenant_subjects ON subjects;
CREATE TRIGGER trg_auto_tenant_subjects
  BEFORE INSERT ON subjects
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- subject_enrollment
DROP TRIGGER IF EXISTS trg_auto_tenant_subject_enrollment ON subject_enrollment;
CREATE TRIGGER trg_auto_tenant_subject_enrollment
  BEFORE INSERT ON subject_enrollment
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- clearance_requests
DROP TRIGGER IF EXISTS trg_auto_tenant_clearance_requests ON clearance_requests;
CREATE TRIGGER trg_auto_tenant_clearance_requests
  BEFORE INSERT ON clearance_requests
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- student_dues
DROP TRIGGER IF EXISTS trg_auto_tenant_student_dues ON student_dues;
CREATE TRIGGER trg_auto_tenant_student_dues
  BEFORE INSERT ON student_dues
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- library_dues
DROP TRIGGER IF EXISTS trg_auto_tenant_library_dues ON library_dues;
CREATE TRIGGER trg_auto_tenant_library_dues
  BEFORE INSERT ON library_dues
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- ia_attendance
DROP TRIGGER IF EXISTS trg_auto_tenant_ia_attendance ON ia_attendance;
CREATE TRIGGER trg_auto_tenant_ia_attendance
  BEFORE INSERT ON ia_attendance
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- activity_logs
DROP TRIGGER IF EXISTS trg_auto_tenant_activity_logs ON activity_logs;
CREATE TRIGGER trg_auto_tenant_activity_logs
  BEFORE INSERT ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- audit_logs
DROP TRIGGER IF EXISTS trg_auto_tenant_audit_logs ON audit_logs;
CREATE TRIGGER trg_auto_tenant_audit_logs
  BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- notifications
DROP TRIGGER IF EXISTS trg_auto_tenant_notifications ON notifications;
CREATE TRIGGER trg_auto_tenant_notifications
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- hall_ticket_templates
DROP TRIGGER IF EXISTS trg_auto_tenant_hall_ticket_templates ON hall_ticket_templates;
CREATE TRIGGER trg_auto_tenant_hall_ticket_templates
  BEFORE INSERT ON hall_ticket_templates
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- ============================================================
-- 3. Fix RESTRICTIVE policies — add WITH CHECK for INSERT
--    The USING clause handles SELECT/UPDATE/DELETE.
--    The WITH CHECK clause handles INSERT/UPDATE (new row check).
-- ============================================================

-- Drop and re-create with proper WITH CHECK clauses
DROP POLICY IF EXISTS "tenant_isolation_profiles" ON profiles;
CREATE POLICY "tenant_isolation_profiles" ON profiles
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_departments" ON departments;
CREATE POLICY "tenant_isolation_departments" ON departments
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_semesters" ON semesters;
CREATE POLICY "tenant_isolation_semesters" ON semesters
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_subjects" ON subjects;
CREATE POLICY "tenant_isolation_subjects" ON subjects
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_subject_enrollment" ON subject_enrollment;
CREATE POLICY "tenant_isolation_subject_enrollment" ON subject_enrollment
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_clearance_requests" ON clearance_requests;
CREATE POLICY "tenant_isolation_clearance_requests" ON clearance_requests
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_student_dues" ON student_dues;
CREATE POLICY "tenant_isolation_student_dues" ON student_dues
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_library_dues" ON library_dues;
CREATE POLICY "tenant_isolation_library_dues" ON library_dues
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_ia_attendance" ON ia_attendance;
CREATE POLICY "tenant_isolation_ia_attendance" ON ia_attendance
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_activity_logs" ON activity_logs;
CREATE POLICY "tenant_isolation_activity_logs" ON activity_logs
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_audit_logs" ON audit_logs;
CREATE POLICY "tenant_isolation_audit_logs" ON audit_logs
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_notifications" ON notifications;
CREATE POLICY "tenant_isolation_notifications" ON notifications
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "tenant_isolation_hall_ticket_templates" ON hall_ticket_templates;
CREATE POLICY "tenant_isolation_hall_ticket_templates" ON hall_ticket_templates
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
