-- Add principal to Role enum at application logic level 
-- (we can't easily alter enum if it's used natively, but here we just store role as text or varchar)

create table if not exists public.activity_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id),
    user_role text,
    department_id uuid references public.departments(id),
    user_name text,
    action text not null,
    details text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.activity_logs enable row level security;

-- Policy for Principals: View ALL logs globally
create policy "Principals view all logs" 
on public.activity_logs for select to authenticated 
using (
  exists (select 1 from profiles where id = auth.uid() and role = 'principal')
);

-- Policy for HODs: View their department's logs + Admin logs
create policy "HODs view their dept and admin logs" 
on public.activity_logs for select to authenticated 
using (
  exists (
    select 1 from profiles 
    where id = auth.uid() 
      and role = 'hod' 
      and (
        (activity_logs.department_id = profiles.department_id) 
        or (activity_logs.user_role = 'admin')
      )
  )
);

-- Policy for Admins: View only their own logs
create policy "Admins view only their own logs" 
on public.activity_logs for select to authenticated 
using (
  exists (
    select 1 from profiles 
    where id = auth.uid() and role = 'admin'
  )
  and auth.uid() = activity_logs.user_id
);

-- Policy for Accounts (and others): View only their own logs
create policy "Users view only their own logs" 
on public.activity_logs for select to authenticated 
using (
  not exists (
    select 1 from profiles 
    where id = auth.uid() and role in ('principal', 'hod', 'admin')
  )
  and auth.uid() = activity_logs.user_id
);

-- Allow anyone to insert their own logs
create policy "Users can insert their own logs" 
on public.activity_logs for insert to authenticated 
with check (
  auth.uid() = user_id
);
