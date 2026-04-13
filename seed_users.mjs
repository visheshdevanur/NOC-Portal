import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://znjydonihpdxzmeqzylk.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_zM7DBHUvQaUpfQ8jQVoqcA_OdUcqzSc'
);

async function seed() {
  console.log("Seeding users...");
  const users = [
    { email: 'student@test.com', password: 'password123', role: 'student', name: 'Alwin (Student)' },
    { email: 'faculty@test.com', password: 'password123', role: 'faculty', name: 'Dr. Smith (Faculty)' },
    { email: 'staff@test.com', password: 'password123', role: 'staff', name: 'Library Staff', department_id: 'library' },
    { email: 'hod@test.com', password: 'password123', role: 'hod', name: 'Prof. Johnson (HOD)' },
    { email: 'admin@test.com', password: 'password123', role: 'admin', name: 'System Admin' },
  ];

  for (const u of users) {
    const { data, error } = await supabase.auth.signUp({
      email: u.email,
      password: u.password,
    });
    
    if (error) {
      console.log(`Failed to create ${u.email}:`, error.message);
    } else {
      console.log(`Created ${u.email} successfully.`);
      // Profile insert
      if (data.user) {
        // Wait 1 second just in case
        await new Promise(r => setTimeout(r, 1000));
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: u.name,
          role: u.role,
          department_id: u.department_id || null
        });
        if (profileError) {
          console.log(`Failed to create profile for ${u.role}:`, profileError.message);
        } else {
          console.log(`Profile linked for ${u.role}.`);
        }
      }
    }
  }
  
  // Seed initial subjects
  const subjects = [
    { subject_name: 'Advanced Algorithms', subject_code: 'CS401' },
    { subject_name: 'Database Management', subject_code: 'CS402' }
  ];
  
  const { error: subErr } = await supabase.from('subjects').upsert(subjects, { onConflict: 'subject_code' });
  if (subErr) console.log("Failed to seed subjects:", subErr.message);
  else console.log("Subjects verified.");
  
  console.log("Done!");
  process.exit(0);
}

seed();
