-- Create table for tracking imported teachers
CREATE TABLE IF NOT EXISTS imported_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department_id, teacher_id)
);

-- Enable RLS
ALTER TABLE imported_teachers ENABLE ROW LEVEL SECURITY;

-- Policies
-- Anyone can view imported teachers
CREATE POLICY "Anyone can view imported teachers" ON imported_teachers
  FOR SELECT USING (true);

-- HODs can insert imported teachers for their department
CREATE POLICY "HODs can import teachers" ON imported_teachers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'hod' 
      AND department_id = imported_teachers.department_id
    )
  );

-- HODs can delete imported teachers for their department
CREATE POLICY "HODs can remove imported teachers" ON imported_teachers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'hod' 
      AND department_id = imported_teachers.department_id
    )
  );
