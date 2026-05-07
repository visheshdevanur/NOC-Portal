-- =============================================================
-- 0084: SECURITY — search_path hardening for all SECURITY DEFINER functions
-- =============================================================
-- PostgreSQL SECURITY DEFINER functions execute with the privileges of
-- the function owner. If search_path is not explicitly set, an attacker
-- who can create objects in a schema on the search_path can hijack
-- function calls by creating malicious objects with the same name.
--
-- Fix: Set search_path = public on all SECURITY DEFINER functions.
-- Only create_payment_order_atomic (0081) had this — all others were missing.
--
-- Reference: https://www.postgresql.org/docs/current/sql-createfunction.html
-- =============================================================

-- 1. get_my_tenant_id (0072/0077)
ALTER FUNCTION get_my_tenant_id() SET search_path = public;

-- 2. auto_set_tenant_id (0074)
ALTER FUNCTION auto_set_tenant_id() SET search_path = public;

-- 3. bulk_process_college_dues (0077/0083)
ALTER FUNCTION bulk_process_college_dues(UUID[], NUMERIC[], UUID[]) SET search_path = public;

-- 4. bulk_process_library_dues (0077/0083)
ALTER FUNCTION bulk_process_library_dues(TEXT[]) SET search_path = public;

-- 5. bulk_set_attendance_dues (0077/0083)
ALTER FUNCTION bulk_set_attendance_dues(UUID, JSONB) SET search_path = public;

-- 6. bulk_promote_students (0077/0083)
ALTER FUNCTION bulk_promote_students(UUID[], UUID) SET search_path = public;

-- 7. assign_teacher_to_section_rpc (0078/0083)
ALTER FUNCTION assign_teacher_to_section_rpc(UUID, TEXT, UUID, UUID) SET search_path = public;

-- 8. admin_update_user_credentials (0078)
ALTER FUNCTION admin_update_user_credentials(UUID, TEXT, TEXT) SET search_path = public;

-- 9. admin_delete_user (0078)
ALTER FUNCTION admin_delete_user(UUID) SET search_path = public;

-- 10. process_payment_webhook (0078)
ALTER FUNCTION process_payment_webhook(TEXT, TEXT, NUMERIC) SET search_path = public;

-- 11. advance_clearance_stage (0078)
ALTER FUNCTION advance_clearance_stage(UUID, TEXT) SET search_path = public;

-- 12. prevent_role_escalation (0078) — trigger function
ALTER FUNCTION prevent_role_escalation() SET search_path = public;

-- 13. prevent_student_fee_self_verify (0078) — trigger function
ALTER FUNCTION prevent_student_fee_self_verify() SET search_path = public;

-- 14. evaluate_clearance_stage (0019/0062/0065) — trigger function
DO $$ BEGIN
  ALTER FUNCTION evaluate_clearance_stage() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 15. auto_populate_library_dues (0036) — trigger function
DO $$ BEGIN
  ALTER FUNCTION auto_populate_library_dues() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 16. handle_attendance_fee (0028/0070) — trigger function
DO $$ BEGIN
  ALTER FUNCTION handle_attendance_fee() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 17. sync_email_to_profile (0016) — trigger function
DO $$ BEGIN
  ALTER FUNCTION sync_email_to_profile() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 18. create_student_dues_record (0012/0035) — trigger function
DO $$ BEGIN
  ALTER FUNCTION create_student_dues_record() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 19. auto_create_clearance_request (0009) — trigger function
DO $$ BEGIN
  ALTER FUNCTION auto_create_clearance_request() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 20. Fine category authorization triggers (0076)
DO $$ BEGIN
  ALTER FUNCTION validate_fine_category_authorization() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION validate_fine_category_update_authorization() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 21. Promotion functions (0054/0055/0056)
DO $$ BEGIN
  ALTER FUNCTION promote_students_bulk(UUID, UUID) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION graduate_students_bulk(UUID) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 22. Clearance demotion (0065)
DO $$ BEGIN
  ALTER FUNCTION demote_clearance_on_new_fine() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION auto_set_fine_on_rejection() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION auto_recalculate_fines_on_ia() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 23. Platform error logs RPCs (0077_platform_error_logs)
DO $$ BEGIN
  ALTER FUNCTION log_platform_error(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 24. Delete user cascade (0066)
DO $$ BEGIN
  ALTER FUNCTION delete_user_cascade(UUID) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 25. Library dues permitted (0058/0059)
DO $$ BEGIN
  ALTER FUNCTION evaluate_library_clearance() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
