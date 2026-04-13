-- 0024_custom_template.sql

-- Expand hall ticket templates to support visual mapping
ALTER TABLE hall_ticket_templates ADD COLUMN IF NOT EXISTS bg_image_url TEXT;

-- Use JSONB to store { "studentName": { "x": 0, "y": 0 }, "table": { "x": 0, "y": 0 } }
ALTER TABLE hall_ticket_templates ADD COLUMN IF NOT EXISTS mapping_coordinates JSONB DEFAULT '{}'::jsonb;
