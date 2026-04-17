-- 0032_librarian_role_and_stage.sql
-- Add librarian role and library_review stage to enums

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'librarian';
ALTER TYPE clearance_stage ADD VALUE IF NOT EXISTS 'library_review' AFTER 'faculty_review';
