-- Allow FYC and Admin roles to insert/delete from imported_teachers
-- Previously only HODs could import teachers, blocking FYC dashboard imports

-- Drop old restrictive policies
DROP POLICY IF EXISTS "HODs can import teachers" ON imported_teachers;
DROP POLICY IF EXISTS "HODs can remove imported teachers" ON imported_teachers;

-- New INSERT policy: HOD, FYC, Admin, Clerk can import teachers
CREATE POLICY "Authorized roles can import teachers" ON imported_teachers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('hod', 'fyc', 'admin', 'clerk')
    )
  );

-- New DELETE policy: HOD, FYC, Admin, Clerk can remove imported teachers
CREATE POLICY "Authorized roles can remove imported teachers" ON imported_teachers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('hod', 'fyc', 'admin', 'clerk')
    )
  );
