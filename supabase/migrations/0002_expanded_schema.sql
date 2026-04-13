-- 0002_expanded_schema.sql

-- New Enums
CREATE TYPE audit_action AS ENUM ('created', 'updated', 'approved', 'rejected', 'escalated');
CREATE TYPE notification_type AS ENUM ('info', 'success', 'warning', 'error');
CREATE TYPE clearance_stage AS ENUM ('student_application', 'faculty_review', 'department_review', 'hod_review', 'cleared', 'rejected');

-- Enhance Profiles
ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();

-- Expand Subject Enrollment
ALTER TABLE subject_enrollment ADD COLUMN status clearance_status DEFAULT 'pending'::clearance_status;
ALTER TABLE subject_enrollment ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Expand Department Clearance
ALTER TABLE department_clearance ADD COLUMN status clearance_status DEFAULT 'pending'::clearance_status;
ALTER TABLE department_clearance ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- New Table: Clearance Requests (replaces or enhances clearance_master)
-- We will keep clearance_master but rename it conceptually, or just add a new comprehensive requests table.
-- Let's create `clearance_requests` to track the overall application.
CREATE TABLE clearance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  current_stage clearance_stage DEFAULT 'student_application'::clearance_stage,
  status clearance_status DEFAULT 'pending'::clearance_status,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- New Table: Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  action audit_action NOT NULL,
  stage clearance_stage NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- New Table: Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type notification_type DEFAULT 'info'::notification_type,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE clearance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- clearance_requests Policies
CREATE POLICY "Students can view own requests" ON clearance_requests FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Students can create requests" ON clearance_requests FOR INSERT WITH CHECK (student_id = auth.uid());
CREATE POLICY "Staff, Faculty, HOD, Admin can read all requests" ON clearance_requests 
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty', 'staff', 'hod', 'admin')));
CREATE POLICY "Faculty, Staff, HOD, Admin can update requests" ON clearance_requests 
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty', 'staff', 'hod', 'admin')));

-- audit_logs Policies
CREATE POLICY "Users can read own relevant audit logs" ON audit_logs FOR SELECT USING (student_id = auth.uid() OR user_id = auth.uid());
CREATE POLICY "Admin can read all audit logs" ON audit_logs FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "System can insert audit logs" ON audit_logs FOR INSERT WITH CHECK (true); -- Usually inserted via triggers or secured API

-- notifications Policies
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);

-- Triggers for 'updated_at'
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_request_update
BEFORE UPDATE ON clearance_requests
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_check_enrollment_update
BEFORE UPDATE ON subject_enrollment
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_check_department_update
BEFORE UPDATE ON department_clearance
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Re-evaluating the check_clearances logic
CREATE OR REPLACE FUNCTION evaluate_clearance_stage()
RETURNS TRIGGER AS $$
DECLARE
  req record;
  pending_faculty INT;
  rejected_faculty INT;
  pending_dept INT;
  rejected_dept INT;
  total_fine DECIMAL;
BEGIN
  -- We run this whenever a subject_enrollment or department_clearance changes
  
  -- Prevent evaluating if no request exists
  SELECT * INTO req FROM clearance_requests WHERE student_id = NEW.student_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COUNT(CASE WHEN status='rejected' THEN 1 END) INTO pending_faculty, rejected_faculty
  FROM subject_enrollment WHERE student_id = NEW.student_id AND status != 'completed';
  
  SELECT COUNT(*), COUNT(CASE WHEN status='rejected' THEN 1 END) INTO pending_dept, rejected_dept
  FROM department_clearance WHERE student_id = NEW.student_id AND status != 'completed';
  
  SELECT SUM(fine_amount) INTO total_fine FROM department_clearance WHERE student_id = NEW.student_id;

  -- Phase 1: Faculty Review
  IF req.current_stage = 'faculty_review' THEN
    IF rejected_faculty > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Rejected by faculty' WHERE id = req.id;
    ELSIF pending_faculty = 0 THEN
       UPDATE clearance_requests SET current_stage = 'department_review' WHERE id = req.id;
    END IF;
  END IF;

  -- Phase 2: Department Review  
  IF req.current_stage = 'department_review' THEN
    IF rejected_dept > 0 THEN
       UPDATE clearance_requests SET status = 'rejected', remarks = 'Rejected by department' WHERE id = req.id;
    ELSIF pending_dept = 0 AND COALESCE(total_fine, 0) = 0 THEN
       UPDATE clearance_requests SET current_stage = 'hod_review' WHERE id = req.id;
    END IF;
  END IF;

  -- Phase 3: HOD review happens manually by updating clearance_requests directly.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_eval_faculty AFTER UPDATE ON subject_enrollment
FOR EACH ROW EXECUTE FUNCTION evaluate_clearance_stage();

CREATE TRIGGER trg_eval_dept AFTER UPDATE ON department_clearance
FOR EACH ROW EXECUTE FUNCTION evaluate_clearance_stage();
