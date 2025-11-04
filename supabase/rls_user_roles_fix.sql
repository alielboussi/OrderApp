-- Fix infinite recursion in RLS for public.user_roles by removing self-referential policy logic
-- We replace existing policies with minimal, non-recursive ones.
-- Users can read their own rows; writes are left to service roles (which bypass RLS) or future admin-specific policies.

DO $$
BEGIN
  -- Ensure RLS is enabled
  ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;

  -- Drop any existing policies to avoid recursion and duplication
  BEGIN EXECUTE 'DROP POLICY IF EXISTS user_roles_select ON public.user_roles'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS user_roles_select_access ON public.user_roles'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS user_roles_rw ON public.user_roles'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS user_roles_update ON public.user_roles'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS user_roles_insert ON public.user_roles'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS user_roles_delete ON public.user_roles'; EXCEPTION WHEN undefined_object THEN NULL; END;

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