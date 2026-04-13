-- 0015_remove_recursive_policy.sql
-- Drop the recursive policies that broke the dashboard

DROP POLICY IF EXISTS "Accounts can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Accounts can read all departments" ON departments;
