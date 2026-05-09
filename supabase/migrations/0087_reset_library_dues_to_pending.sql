-- 0087_reset_library_dues_to_pending.sql
-- Reset all library_dues to pending (has_dues = TRUE) so librarian 
-- must upload CSV to mark students as cleared.

UPDATE library_dues SET has_dues = TRUE, permitted = FALSE WHERE has_dues = FALSE;
