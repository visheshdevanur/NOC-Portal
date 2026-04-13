-- 0020_coe_role_and_templates.sql

-- 1. Add "coe" to user_role ENUM safely
COMMIT; -- Close any running transaction block if the runner opened one
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coe';

-- 2. Create the hall_ticket_templates table
CREATE TABLE IF NOT EXISTS hall_ticket_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name TEXT DEFAULT 'Institutional Name',
  title TEXT DEFAULT 'EXAMINATION HALL TICKET',
  instructions TEXT DEFAULT '1. Please bring this hall ticket to the examination hall.\n2. Do not carry any electronic gadgets.',
  signature_text TEXT DEFAULT 'Controller of Examinations',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE hall_ticket_templates ENABLE ROW LEVEL SECURITY;

-- 4. Policies
-- Anyone logged in can read the template (students need it to download)
CREATE POLICY "Anyone can read hall ticket templates" 
  ON hall_ticket_templates
  FOR SELECT 
  USING (true);

-- Only COE and Admin can update the templates
CREATE POLICY "COE and Admin can update hall ticket templates" 
  ON hall_ticket_templates 
  FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text IN ('admin', 'coe')));

-- Only COE and Admin can insert
CREATE POLICY "COE and Admin can insert hall ticket templates" 
  ON hall_ticket_templates 
  FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role::text IN ('admin', 'coe')));

-- 5. Insert one default template if empty
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hall_ticket_templates LIMIT 1) THEN
    INSERT INTO hall_ticket_templates (institution_name, title, instructions, signature_text)
    VALUES (
      'National Engineering College',
      'END SEMESTER EXAMINATION HALL TICKET',
      '1. Student must carry their College ID card along with this Hall Ticket.\n2. Electronic gadgets including mobile phones and smartwatches are strictly prohibited.\n3. Students must report 30 minutes before the commencement of the examination.',
      'Controller of Examinations'
    );
  END IF;
END $$;

-- 6. Grant Profile Insert/Update permissions for COE role
-- Typically users might want to create profiles, but here Admin creates COE.
-- Let's make sure Admin can see them. Admin policies are usually "ON profiles FOR SELECT USING (true)"
