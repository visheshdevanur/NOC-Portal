-- 0069_attendance_category_first_year_flag.sql
-- Add is_first_year flag to attendance_fine_categories to cleanly separate
-- FYC categories (Sem 1 & 2, all departments) from HOD categories (Sem 3-8, per department).
--
-- FYC creates categories with is_first_year = TRUE → applies to all departments for Sem 1 & 2
-- HOD creates categories with is_first_year = FALSE → applies to their department for Sem 3-8
-- Zero overlap: FYC owns first year, HOD owns their branch from Sem 3 onwards.

-- 1. Add the column
ALTER TABLE attendance_fine_categories
  ADD COLUMN IF NOT EXISTS is_first_year BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Replace ALL RLS policies with clean, role-separated versions
-- ---------------------------------------------------------------

-- SELECT: Everyone sees categories relevant to their role
DROP POLICY IF EXISTS "Dept roles can view categories" ON attendance_fine_categories;
CREATE POLICY "Dept roles can view categories" ON attendance_fine_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          -- Admin sees everything
          role = 'admin'
          -- FYC sees all first-year categories
          OR (role = 'fyc' AND attendance_fine_categories.is_first_year = TRUE)
          -- HOD sees only their dept's non-first-year categories
          OR (role = 'hod' AND profiles.department_id = attendance_fine_categories.department_id AND attendance_fine_categories.is_first_year = FALSE)
          -- Staff sees their dept's non-first-year categories
          OR (role = 'staff' AND profiles.department_id = attendance_fine_categories.department_id AND attendance_fine_categories.is_first_year = FALSE)
          -- Clerk sees first-year categories (same scope as FYC but read-only)
          OR (role = 'clerk' AND attendance_fine_categories.is_first_year = TRUE)
        )
    )
  );

-- INSERT: Only FYC can create first-year, only HOD can create for their dept
DROP POLICY IF EXISTS "Staff/Clerk can create categories" ON attendance_fine_categories;
CREATE POLICY "Roles can create categories" ON attendance_fine_categories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'fyc' AND attendance_fine_categories.is_first_year = TRUE)
          OR (role = 'hod' AND profiles.department_id = attendance_fine_categories.department_id AND attendance_fine_categories.is_first_year = FALSE)
        )
    )
  );

-- UPDATE: Same scoping as INSERT
DROP POLICY IF EXISTS "Staff/Clerk can update categories" ON attendance_fine_categories;
CREATE POLICY "Roles can update categories" ON attendance_fine_categories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'fyc' AND attendance_fine_categories.is_first_year = TRUE)
          OR (role = 'hod' AND profiles.department_id = attendance_fine_categories.department_id AND attendance_fine_categories.is_first_year = FALSE)
        )
    )
  );

-- DELETE: Same scoping
DROP POLICY IF EXISTS "Staff/Clerk can delete categories" ON attendance_fine_categories;
CREATE POLICY "Roles can delete categories" ON attendance_fine_categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR (role = 'fyc' AND attendance_fine_categories.is_first_year = TRUE)
          OR (role = 'hod' AND profiles.department_id = attendance_fine_categories.department_id AND attendance_fine_categories.is_first_year = FALSE)
        )
    )
  );
