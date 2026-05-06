-- 0079_remove_coe_role.sql
-- Complete removal of COE role and hall ticket infrastructure
-- Decision: Delete existing COE users, drop hall_ticket_templates, remove exam columns

-- ============================================================
-- 1. Delete existing COE users from auth and profiles
-- ============================================================
-- First delete from auth.users (cascades to profiles via FK)
DELETE FROM auth.users 
WHERE id IN (SELECT id FROM profiles WHERE role::text = 'coe');

-- ============================================================
-- 2. Drop COE-specific RLS policies
-- ============================================================
DROP POLICY IF EXISTS "COE and Admin can update hall ticket templates" ON hall_ticket_templates;
DROP POLICY IF EXISTS "COE and Admin can insert hall ticket templates" ON hall_ticket_templates;
DROP POLICY IF EXISTS "Anyone can read hall ticket templates" ON hall_ticket_templates;
DROP POLICY IF EXISTS "COE can update subjects" ON subjects;
DROP POLICY IF EXISTS "COE can insert subjects" ON subjects;
DROP POLICY IF EXISTS "tenant_isolation_hall_ticket_templates" ON hall_ticket_templates;

-- ============================================================
-- 3. Drop hall_ticket_templates table entirely (CASCADE drops
--    indexes, triggers, policies, and FK references)
-- ============================================================
DROP TABLE IF EXISTS hall_ticket_templates CASCADE;

-- ============================================================
-- 4. Remove exam_date and exam_time from subjects table
-- ============================================================
ALTER TABLE subjects DROP COLUMN IF EXISTS exam_date;
ALTER TABLE subjects DROP COLUMN IF EXISTS exam_time;

-- ============================================================
-- 5. Update IA attendance policy to exclude COE
-- ============================================================
DROP POLICY IF EXISTS "Admin HOD Staff COE Principal can view all ia_attendance" ON ia_attendance;
CREATE POLICY "Admin HOD Staff Principal can view all ia_attendance" ON ia_attendance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() 
            AND role IN ('admin', 'hod', 'staff', 'principal'))
  );

-- ============================================================
-- 6. Update admin insert profiles policy to exclude COE
-- ============================================================
DROP POLICY IF EXISTS "Admin can insert profiles" ON profiles;
CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    AND role::text IN ('hod', 'accounts', 'librarian', 'principal', 'fyc')
  );

-- ============================================================
-- 7. NOTE: PostgreSQL does not support DROP VALUE from ENUM.
--    The 'coe' value remains in user_role enum but is unused.
--    No new users can be created with role='coe' because:
--    - Edge Function create-user no longer allows it
--    - Admin insert policy no longer allows it
--    - Frontend no longer has the option
-- ============================================================
