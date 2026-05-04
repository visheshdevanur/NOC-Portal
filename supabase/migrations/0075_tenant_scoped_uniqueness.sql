-- 0075_tenant_scoped_uniqueness.sql
-- Enforce tenant-scoped uniqueness constraints and global admin email uniqueness

-- ============================================================
-- 1. ROLL NUMBER — unique per tenant only (not global)
-- ============================================================
-- Drop any existing global roll_number unique constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_roll_number_key;
DROP INDEX IF EXISTS idx_global_student_roll_unique;

-- Tenant-scoped: same roll number CAN exist in different tenants
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_roll_per_tenant
  ON profiles (tenant_id, roll_number)
  WHERE roll_number IS NOT NULL AND role = 'student';

-- ============================================================
-- 2. DEPARTMENT NAME — unique per tenant
-- ============================================================
-- Drop any existing name constraint
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_name_key;

-- Same department name CAN exist in different tenants
ALTER TABLE departments
  ADD CONSTRAINT departments_tenant_name_unique UNIQUE (tenant_id, name);

-- ============================================================
-- 3. ADMIN EMAIL — globally unique across tenants
-- ============================================================
-- Ensure no two tenants share the same admin email
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_admin_email_key;
ALTER TABLE tenants ADD CONSTRAINT tenants_admin_email_unique UNIQUE (admin_email);

-- ============================================================
-- 4. SUBJECT CODE — unique per tenant + department + semester
-- ============================================================
-- IMPORTANT: Run verify_subjects.sql first!
-- Drop old constraint (department-only scope)
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_subject_code_dept_unique;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_subject_code_key;

-- New: tenant + department + semester scoped
-- This allows same subject code in different semesters/departments
ALTER TABLE subjects
  ADD CONSTRAINT subjects_tenant_dept_sem_code_unique
  UNIQUE (tenant_id, department_id, semester_id, subject_code);

-- ============================================================
-- 5. ATTENDANCE FINE CATEGORIES — add tenant_id + tenant isolation
-- ============================================================

-- Add tenant_id column
ALTER TABLE attendance_fine_categories
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Backfill existing rows
UPDATE attendance_fine_categories
SET tenant_id = 'a0000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Auto-fill trigger
DROP TRIGGER IF EXISTS trg_auto_tenant_attendance_fine_categories ON attendance_fine_categories;
CREATE TRIGGER trg_auto_tenant_attendance_fine_categories
  BEFORE INSERT ON attendance_fine_categories
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

-- Tenant isolation (RESTRICTIVE)
DROP POLICY IF EXISTS "tenant_isolation_attendance_fine_categories" ON attendance_fine_categories;
CREATE POLICY "tenant_isolation_attendance_fine_categories" ON attendance_fine_categories
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_attendance_fine_categories_tenant
  ON attendance_fine_categories(tenant_id);

-- ============================================================
-- 6. DEPARTMENT DUES — add tenant_id (if missing)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE department_dues ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
  UPDATE department_dues SET tenant_id = 'a0000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
