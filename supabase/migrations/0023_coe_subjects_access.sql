-- 0023_coe_subjects_access.sql

-- Give COE update permission to update timetables
DROP POLICY IF EXISTS "COE can update subjects" ON subjects;
CREATE POLICY "COE can update subjects" ON subjects
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'coe')
  );

-- Give COE insert permission (in case upsert tries to insert when id isn't explicitly provided, though we usually just update)
DROP POLICY IF EXISTS "COE can insert subjects" ON subjects;
CREATE POLICY "COE can insert subjects" ON subjects
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text = 'coe')
  );
