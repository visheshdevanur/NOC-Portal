-- Change subject_code unique constraint from global to per-department
-- This allows the same subject code to exist in multiple departments
-- (e.g. when Staff imports subjects from other departments)

ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_subject_code_key;
ALTER TABLE subjects ADD CONSTRAINT subjects_subject_code_dept_unique UNIQUE (subject_code, department_id);
