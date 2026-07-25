import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://znjydonihpdxzmeqzylk.supabase.co',
  'sb_publishable_zM7DBHUvQaUpfQ8jQVoqcA_OdUcqzSc'
);

// Check VINOD PATEL's enrollment with the 12456 subject
const { data, error } = await supabase.functions.invoke('admin-api', {
  body: { action: 'debug-subject', subject_code: 'vinod-enrollment' }
});

// Actually let me check via a different approach - get student IA records
const { data: iaData } = await supabase.functions.invoke('admin-api', {
  body: { action: 'get-student-ia', student_id: 'find-vinod' }
});

console.log('IA data:', JSON.stringify(iaData, null, 2));
