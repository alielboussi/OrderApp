-- Wrapper to disambiguate has_role calls in RLS policies (2-arg -> 3-arg with NULL outlet)
-- Avoids ambiguity when both has_role(uuid,text) and has_role(uuid,text,uuid) exist.

CREATE OR REPLACE FUNCTION public.has_role_any_outlet(p_user uuid, p_role text)
RETURNS boolean
LANGUAGE sql
SET search_path = pg_temp
STABLE
AS $$
  SELECT public.has_role(p_user, p_role, NULL::uuid);
$$;

-- Overload to pass an explicit outlet when available, preserving clear resolution
CREATE OR REPLACE FUNCTION public.has_role_any_outlet(p_user uuid, p_role text, p_outlet uuid)
RETURNS boolean
LANGUAGE sql
SET search_path = pg_temp
STABLE
AS $$
  SELECT public.has_role(p_user, p_role, p_outlet);
$$;