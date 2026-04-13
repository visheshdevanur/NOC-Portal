-- 0025_template_mode.sql
-- Add a mode toggle so COE can choose between 'editor' (Template Editor) or 'builder' (Visual Builder)
ALTER TABLE hall_ticket_templates ADD COLUMN IF NOT EXISTS template_mode TEXT DEFAULT 'editor' CHECK (template_mode IN ('editor', 'builder'));
