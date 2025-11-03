-- Helper to fetch a default outlet_id for the current user (or provided user)
-- Returns NULL if the user has no outlet memberships.
-- Usage from client: RPC call to public.default_outlet_id() before subscribing.

CREATE OR REPLACE FUNCTION public.default_outlet_id(p_user uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
SET search_path = pg_temp
STABLE
AS $$
  -- member_outlet_ids returns uuid[] in this database; take the first element
  SELECT (public.member_outlet_ids(COALESCE(p_user, (select auth.uid()))))[1];
$$;