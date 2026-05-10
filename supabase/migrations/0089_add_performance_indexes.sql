-- 0089_add_performance_indexes.sql
-- Add indexes for faster queries across dashboards

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_dept ON profiles(role, department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_semester_id ON profiles(semester_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON profiles(created_by);

-- Clearance requests indexes
CREATE INDEX IF NOT EXISTS idx_clearance_requests_student_id ON clearance_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_clearance_requests_status ON clearance_requests(status);

-- Student dues indexes
CREATE INDEX IF NOT EXISTS idx_student_dues_student_id ON student_dues(student_id);

-- Library dues indexes  
CREATE INDEX IF NOT EXISTS idx_library_dues_student_id ON library_dues(student_id);

-- Activity logs indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_department_id ON activity_logs(department_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_role ON activity_logs(user_role);

-- Subject enrollment indexes
CREATE INDEX IF NOT EXISTS idx_subject_enrollment_teacher_id ON subject_enrollment(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subject_enrollment_student_id ON subject_enrollment(student_id);
