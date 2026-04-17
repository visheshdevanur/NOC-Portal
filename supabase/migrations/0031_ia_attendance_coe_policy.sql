-- 0031_ia_attendance_coe_policy.sql

-- Drop the old policy
DROP POLICY IF EXISTS "Admin HOD Staff can view all ia_attendance" ON ia_attendance;

-- Recreate it with 'coe' and 'principal' included
CREATE POLICY "Admin HOD Staff COE Principal can view all ia_attendance" ON ia_attendance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hod', 'staff', 'coe', 'principal'))
  );
