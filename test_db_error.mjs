import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://znjydonihpdxzmeqzylk.supabase.co', 'sb_publishable_zM7DBHUvQaUpfQ8jQVoqcA_OdUcqzSc');
async function run() {
  const fycId = '9e5d411e-8e94-4718-93ef-6cbdd9061f3e';
  const { data, error } = await supabase
    .from('profiles')
    .select('*, departments(name)')
    .in('role', ['clerk', 'teacher', 'faculty'])
    .eq('created_by', fycId)
    .order('created_at', { ascending: false });
  if (error) console.error("Error fetching:", error);
  else console.log("Fetched successfully:", data.length, "users");
  
  const { data: logsData, error: logsError } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (logsError) console.error("Error logs:", logsError);
  else console.log("Logs:", logsData.length);
}
run();
