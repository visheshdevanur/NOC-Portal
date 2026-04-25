import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://znjydonihpdxzmeqzylk.supabase.co', 'sb_publishable_zM7DBHUvQaUpfQ8jQVoqcA_OdUcqzSc');
async function run() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, created_by').eq('created_by', '9e5d411e-8e94-4718-93ef-6cbdd9061f3e');
  if (error) console.error(error);
  else console.log("Fetched with anon key (RLS check):", JSON.stringify(data, null, 2));
}
run();
