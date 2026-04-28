-- 0058_attendance_categories.sql
-- Attendance Fine Categories: per-department configurable fine slabs

-- ============================================================
-- 1. CREATE attendance_fine_categories TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_fine_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  min_pct INT NOT NULL CHECK (min_pct >= 0 AND min_pct <= 100),
  max_pct INT NOT NULL CHECK (max_pct >= 0 AND max_pct <= 100),
  fine_amount NUMERIC NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_range CHECK (min_pct <= max_pct)
);

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE attendance_fine_categories ENABLE ROW LEVEL SECURITY;

-- Staff, Clerk, HOD, Admin can view categories in their department
DROP POLICY IF EXISTS "Dept roles can view categories" ON attendance_fine_categories;
CREATE POLICY "Dept roles can view categories" ON attendance_fine_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'hod', 'admin')
        AND (department_id = attendance_fine_categories.department_id OR role = 'admin')
    )
  );

-- Staff, Clerk can create categories for their department
DROP POLICY IF EXISTS "Staff/Clerk can create categories" ON attendance_fine_categories;
CREATE POLICY "Staff/Clerk can create categories" ON attendance_fine_categories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'admin')
        AND (department_id = attendance_fine_categories.department_id OR role = 'admin')
    )
  );

-- Staff, Clerk can update categories in their department
DROP POLICY IF EXISTS "Staff/Clerk can update categories" ON attendance_fine_categories;
CREATE POLICY "Staff/Clerk can update categories" ON attendance_fine_categories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'admin')
        AND (department_id = attendance_fine_categories.department_id OR role = 'admin')
    )
  );

-- Staff, Clerk can delete categories in their department
DROP POLICY IF EXISTS "Staff/Clerk can delete categories" ON attendance_fine_categories;
CREATE POLICY "Staff/Clerk can delete categories" ON attendance_fine_categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('staff', 'clerk', 'admin')
        AND (department_id = attendance_fine_categories.department_id OR role = 'admin')
    )
  );
