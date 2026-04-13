-- 0022_add_exam_timetable.sql

-- 1. Enhance the hall_ticket_templates table
ALTER TABLE hall_ticket_templates ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Convert signature_text to signatures JSON array if necessary
ALTER TABLE hall_ticket_templates ADD COLUMN IF NOT EXISTS signatures JSONB DEFAULT '["Controller of Examinations"]'::jsonb;

-- 2. Enhance the subjects table to include exam dates and times
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS exam_date DATE;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS exam_time TEXT;

-- (Optional) If we need to safely migrate old signature_text to the JSON format:
-- UPDATE hall_ticket_templates SET signatures = json_build_array(signature_text) WHERE signature_text IS NOT NULL AND signatures IS NULL;
