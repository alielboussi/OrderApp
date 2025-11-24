-- Fix infinite recursion in RLS for public.user_roles by removing self-referential policy logic
-- We replace existing policies with minimal, non-recursive ones.
-- Users can read their own rows; writes are left to service roles (which bypass RLS) or future admin-specific policies.

DO $$
DECLARE
  policy_record record;
BEGIN
  -- Ensure RLS is enabled
  ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;

  -- Drop ALL existing policies dynamically to avoid recursion and name drift
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', policy_record.policyname);
  END LOOP;

  -- Minimal, non-recursive SELECT policy: a user can read their own role rows
  CREATE POLICY user_roles_select
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

  -- Note: No INSERT/UPDATE/DELETE policies are created here to avoid complex recursion via helper
  -- functions that themselves read user_roles. Admin/service key operations should use the service
  -- role (bypasses RLS) or you can add explicit admin-only policies later if needed.
END
$$;