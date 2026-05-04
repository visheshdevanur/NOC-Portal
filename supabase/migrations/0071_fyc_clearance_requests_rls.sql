-- 0071_fyc_clearance_requests_rls.sql
-- Allow FYC to read and update clearance requests

CREATE POLICY "FYC can read clearance requests" ON clearance_requests
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'fyc'));

CREATE POLICY "FYC can update clearance requests" ON clearance_requests
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'fyc'));
