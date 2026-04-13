import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://znjydonihpdxzmeqzylk.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_zM7DBHUvQaUpfQ8jQVoqcA_OdUcqzSc'
);

async function testApply() {
  // 1. Login as student
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'student@test.com',
    password: 'password123',
  });
  
  if (authErr) {
    console.log("Auth Error:", authErr.message);
    return;
  }
  
  console.log("Logged in as:", authData.user.id);
  const userId = authData.user.id;
  
  // Try inserting clearance_requests
  const { data: reqData, error: reqErr } = await supabase
    .from('clearance_requests')
    .insert([{ student_id: userId, current_stage: 'faculty_review', status: 'pending' }])
    .select()
    .single();
    
  if (reqErr) {
    console.log("REQ ERROR:", reqErr);
  } else {
    console.log("REQ SUCCESS:", reqData);
  }

  // Try creating dept clearance
  const depts = ['library', 'hostel', 'accounts'];
  const deptInserts = depts.map(d => ({
    student_id: userId,
    dept_type: d,
    status: 'pending',
    fine_amount: 100
  }));
  const { error: deptErr } = await supabase.from('department_clearance').insert(deptInserts);
  if (deptErr) console.log("DEPT ERROR:", deptErr);

  // Try creating subject clearance
  const { data: faculty } = await supabase.from('profiles').select('id').eq('role', 'faculty').limit(1);
  const { data: subjects } = await supabase.from('subjects').select('id').limit(1);

  if (faculty?.length && subjects?.length) {
    const enrollInserts = [{
      student_id: userId,
      subject_id: subjects[0].id,
      teacher_id: faculty[0].id,
      attendance_pct: 90,
      status: 'pending',
      remarks: null
    }];
    const { error: subErr } = await supabase.from('subject_enrollment').insert(enrollInserts);
    if (subErr) console.log("SUB ERROR:", subErr);
  }
  
  console.log("Done test");
  process.exit(0);
}

testApply();
