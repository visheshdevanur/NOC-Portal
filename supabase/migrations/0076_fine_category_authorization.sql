-- 0076_fine_category_authorization.sql
-- Enforce: FYC can only create fine categories for Sem 1 & 2
--          HOD can only create for Sem 3-8 in their own department
--          Neither can modify the other's categories

-- ============================================================
-- 1. Authorization trigger for INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_fine_category_authorization()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  user_dept_id UUID;
  sem_name TEXT;
  sem_number INT;
  category_created_by_role TEXT;
BEGIN
  -- Get current user's role and department
  SELECT role, department_id INTO user_role, user_dept_id
  FROM profiles WHERE id = auth.uid();

  -- Admin bypasses all checks
  IF user_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Get the semester name/number for this category's department
  SELECT s.name INTO sem_name
  FROM semesters s
  JOIN departments d ON d.id = NEW.department_id
  WHERE s.department_id = d.id
    AND s.id = (
      -- Find which semester this fine category targets
      -- Fine categories are per-department, so look at the department's semesters
      SELECT semester_id FROM subjects 
      WHERE department_id = NEW.department_id 
      LIMIT 1
    );

  -- Try to extract semester number from the department's context
  -- For FYC: they create categories tied to departments but for Sem 1-2 only
  -- For HOD: they create categories for their own dept, Sem 3-8 only

  -- ---- FYC RULES ----
  IF user_role = 'fyc' THEN
    -- FYC can create for ANY department (first year is cross-department)
    -- But the category should be flagged for first year use
    -- Check if is_first_year flag exists and is set
    IF NEW.is_first_year IS NOT NULL AND NEW.is_first_year = false THEN
      RAISE EXCEPTION 'FYC can only create fine categories for first year (Sem 1 & 2)';
    END IF;
    -- Auto-set the flag
    NEW.is_first_year := true;
    RETURN NEW;
  END IF;

  -- ---- HOD RULES ----
  IF user_role = 'hod' THEN
    -- HOD can only create for their OWN department
    IF NEW.department_id != user_dept_id THEN
      RAISE EXCEPTION 'HOD can only create fine categories for their own department';
    END IF;
    -- HOD categories are NOT first year
    IF NEW.is_first_year IS NOT NULL AND NEW.is_first_year = true THEN
      RAISE EXCEPTION 'HOD cannot create first year fine categories. Only FYC can do that.';
    END IF;
    NEW.is_first_year := false;
    RETURN NEW;
  END IF;

  -- ---- STAFF/CLERK RULES ----
  IF user_role IN ('staff', 'clerk') THEN
    -- Staff/Clerk can only create for their own department
    IF NEW.department_id != user_dept_id THEN
      RAISE EXCEPTION 'You can only create fine categories for your own department';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized: your role cannot manage fine categories';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Add is_first_year column if missing
-- ============================================================
ALTER TABLE attendance_fine_categories
  ADD COLUMN IF NOT EXISTS is_first_year BOOLEAN DEFAULT false;

-- Backfill: mark existing categories created by FYC as first year
UPDATE attendance_fine_categories afc
SET is_first_year = true
WHERE EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.id = afc.created_by AND p.role = 'fyc'
);

-- ============================================================
-- 3. Attach the authorization trigger
-- ============================================================
DROP TRIGGER IF EXISTS trg_fine_category_auth ON attendance_fine_categories;
CREATE TRIGGER trg_fine_category_auth
  BEFORE INSERT OR UPDATE ON attendance_fine_categories
  FOR EACH ROW EXECUTE FUNCTION enforce_fine_category_authorization();

-- ============================================================
-- 4. Prevent cross-role modification
--    FYC cannot modify HOD categories and vice versa
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_cross_role_fine_modification()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
  creator_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  
  -- Admin bypasses
  IF user_role = 'admin' THEN RETURN OLD; END IF;

  -- Get who created this category
  SELECT role INTO creator_role FROM profiles WHERE id = OLD.created_by;

  -- FYC cannot modify HOD-created categories
  IF user_role = 'fyc' AND creator_role = 'hod' THEN
    RAISE EXCEPTION 'FYC cannot modify HOD-created fine categories';
  END IF;

  -- HOD cannot modify FYC-created categories
  IF user_role = 'hod' AND creator_role = 'fyc' THEN
    RAISE EXCEPTION 'HOD cannot modify FYC-created fine categories';
  END IF;

  -- Staff/Clerk cannot modify FYC categories
  IF user_role IN ('staff', 'clerk') AND creator_role = 'fyc' THEN
    RAISE EXCEPTION 'Staff/Clerk cannot modify FYC fine categories';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fine_no_cross_modify ON attendance_fine_categories;
CREATE TRIGGER trg_fine_no_cross_modify
  BEFORE UPDATE OR DELETE ON attendance_fine_categories
  FOR EACH ROW EXECUTE FUNCTION prevent_cross_role_fine_modification();
