import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://znjydonihpdxzmeqzylk.supabase.co', 'sb_publishable_zM7DBHUvQaUpfQ8jQVoqcA_OdUcqzSc');
async function run() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, created_by').in('role', ['fyc', 'clerk', 'staff', 'teacher']);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
