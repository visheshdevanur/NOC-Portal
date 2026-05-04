-- 0072_multi_tenant_schema.sql
-- Multi-tenant SaaS architecture: Row-level tenancy (Option B)
-- Adds tenant_id to all existing tables and creates the tenants table.
-- IMPORTANT: Existing data (MIT Mysore) will be assigned to a default tenant.

-- ============================================================
-- 1. Create the tenants table (platform-wide, super admin only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'standard', 'premium')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  admin_email TEXT NOT NULL,
  max_users INT DEFAULT 500,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#004BCA',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on tenants (only super admin via service_role can manage)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read tenants (needed for login tenant resolution)
CREATE POLICY "Anyone can read tenants" ON tenants
  FOR SELECT USING (true);

-- ============================================================
-- 2. Seed the default tenant for existing data (MIT Mysore)
-- ============================================================
INSERT INTO public.tenants (id, name, slug, plan, status, admin_email, max_users)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Maharaja Institute of Technology, Mysore',
  'mit-mysore',
  'premium',
  'active',
  'admin@mitmysore.in',
  9999
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 3. Add tenant_id column to ALL existing tables
-- ============================================================

-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE profiles SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- departments
ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE departments SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- semesters
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE semesters SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- subjects
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE subjects SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- subject_enrollment
ALTER TABLE subject_enrollment ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE subject_enrollment SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- clearance_requests
ALTER TABLE clearance_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE clearance_requests SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- student_dues
ALTER TABLE student_dues ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE student_dues SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- library_dues
ALTER TABLE library_dues ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE library_dues SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- ia_attendance
ALTER TABLE ia_attendance ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE ia_attendance SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- activity_logs
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE activity_logs SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE audit_logs SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE notifications SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- hall_ticket_templates
ALTER TABLE hall_ticket_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE hall_ticket_templates SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- imported_teachers (if exists)
DO $$ BEGIN
  ALTER TABLE imported_teachers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  UPDATE imported_teachers SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- attendance_fine_categories (if exists)
DO $$ BEGIN
  ALTER TABLE attendance_fine_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  UPDATE attendance_fine_categories SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- 4. Create helper function to get current user's tenant_id
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 5. Create tenant-scoped RLS policies
-- These are ADDITIVE — existing policies continue to work.
-- The tenant_id column is nullable for backwards compat,
-- so existing policies won't break.
-- ============================================================

-- Profiles: users can only see profiles in their tenant
CREATE POLICY "tenant_isolation_profiles" ON profiles
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Departments: tenant isolation
CREATE POLICY "tenant_isolation_departments" ON departments
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Semesters: tenant isolation
CREATE POLICY "tenant_isolation_semesters" ON semesters
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Subjects: tenant isolation
CREATE POLICY "tenant_isolation_subjects" ON subjects
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Subject Enrollment: tenant isolation
CREATE POLICY "tenant_isolation_subject_enrollment" ON subject_enrollment
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Clearance Requests: tenant isolation
CREATE POLICY "tenant_isolation_clearance_requests" ON clearance_requests
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Student Dues: tenant isolation
CREATE POLICY "tenant_isolation_student_dues" ON student_dues
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Library Dues: tenant isolation
CREATE POLICY "tenant_isolation_library_dues" ON library_dues
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- IA Attendance: tenant isolation
CREATE POLICY "tenant_isolation_ia_attendance" ON ia_attendance
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Activity Logs: tenant isolation
CREATE POLICY "tenant_isolation_activity_logs" ON activity_logs
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Audit Logs: tenant isolation
CREATE POLICY "tenant_isolation_audit_logs" ON audit_logs
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Notifications: tenant isolation
CREATE POLICY "tenant_isolation_notifications" ON notifications
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- Hall Ticket Templates: tenant isolation
CREATE POLICY "tenant_isolation_hall_ticket_templates" ON hall_ticket_templates
  FOR ALL USING (
    tenant_id IS NULL OR tenant_id = get_my_tenant_id()
  );

-- ============================================================
-- 6. Indexes for performance on tenant_id lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_semesters_tenant_id ON semesters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subjects_tenant_id ON subjects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subject_enrollment_tenant_id ON subject_enrollment(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clearance_requests_tenant_id ON clearance_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_student_dues_tenant_id ON student_dues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_library_dues_tenant_id ON library_dues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ia_attendance_tenant_id ON ia_attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_id ON activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON notifications(tenant_id);
