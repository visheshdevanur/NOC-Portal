import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://znjydonihpdxzmeqzylk.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_zM7DBHUvQaUpfQ8jQVoqcA_OdUcqzSc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDues() {
  console.log('Checking profiles for students...');
  const { data: students, error: studentError } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'student');

  if (studentError) {
    console.error('Error fetching students:', studentError);
    return;
  }
  
  console.log(`Found ${students?.length || 0} students in profiles table.`);
  
  console.log('Checking student_dues table...');
  const { data: dues, error: duesError } = await supabase
    .from('student_dues')
    .select('*');

  if (duesError) {
    console.error('Error fetching dues:', duesError);
    return;
  }

  console.log(`Found ${dues?.length || 0} records in student_dues table.`);
  
  // Find students missing dues
  if (students && dues) {
    const dueStudentIds = new Set(dues.map(d => d.student_id));
    const missing = students.filter(s => !dueStudentIds.has(s.id));
    console.log(`Found ${missing.length} students missing from student_dues.`);
    if (missing.length > 0) {
      console.log('First 3 missing students:', missing.slice(0, 3).map(s => ({ name: s.full_name, id: s.id })));
    }
  }
}

checkDues();
