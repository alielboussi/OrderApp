BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.stocktake_app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  pin_hash text NOT NULL,
  display_name text NULL,
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_stocktake_app_users_email
  ON public.stocktake_app_users (lower(email));

CREATE OR REPLACE FUNCTION public.set_stocktake_app_user_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stocktake_app_user_updated_at ON public.stocktake_app_users;
CREATE TRIGGER trg_stocktake_app_user_updated_at
BEFORE UPDATE ON public.stocktake_app_users
FOR EACH ROW EXECUTE FUNCTION public.set_stocktake_app_user_updated_at();

ALTER TABLE public.stocktake_app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stocktake_app_users_admin_read ON public.stocktake_app_users;
CREATE POLICY stocktake_app_users_admin_read ON public.stocktake_app_users
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  );

DROP POLICY IF EXISTS stocktake_app_users_admin_write ON public.stocktake_app_users;
CREATE POLICY stocktake_app_users_admin_write ON public.stocktake_app_users
  FOR ALL
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'::uuid
    )
  );

CREATE OR REPLACE FUNCTION public.stocktake_app_login(
  p_email text,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_user public.stocktake_app_users%rowtype;
  v_now timestamptz := now();
  v_exp_seconds bigint;
  v_payload jsonb;
  v_token text;
  v_secret text;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' OR p_pin IS NULL OR btrim(p_pin) = '' THEN
    RAISE EXCEPTION 'email and pin required';
  END IF;

  SELECT *
  INTO v_user
  FROM public.stocktake_app_users
  WHERE lower(email) = lower(p_email)
    AND active
  LIMIT 1;

  IF NOT FOUND OR extensions.crypt(p_pin, v_user.pin_hash) <> v_user.pin_hash THEN
    RAISE EXCEPTION 'invalid credentials';
  END IF;

  UPDATE public.stocktake_app_users
  SET last_login_at = v_now
  WHERE id = v_user.id;

  v_exp_seconds := EXTRACT(EPOCH FROM (v_now + interval '12 hours'))::bigint;
  v_payload := jsonb_build_object(
    'sub', v_user.id::text,
    'email', v_user.email,
    'role', 'authenticated',
    'iat', EXTRACT(EPOCH FROM v_now)::bigint,
    'exp', v_exp_seconds
  );

  v_secret := current_setting('app.settings.jwt_secret', true);
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'jwt secret not configured';
  END IF;

  v_token := extensions.sign(v_payload, v_secret);

  RETURN jsonb_build_object(
    'token', v_token,
    'refresh_token', '',
    'expires_at', (v_exp_seconds * 1000),
    'outlet_id', '',
    'outlet_name', '',
    'user_id', v_user.id::text,
    'email', v_user.email,
    'roles', jsonb_build_array(jsonb_build_object(
      'id', '95b6a75d-bd46-4764-b5ea-981b1608f1ca',
      'slug', 'stock operator',
      'normalized_slug', 'stock operator',
      'display_name', 'Stock Operator'
    )),
    'is_admin', false,
    'can_transfer', false,
    'is_transfer_manager', false,
    'is_supervisor', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_stocktake_role(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'
  )
  OR exists (
    select 1
    from public.stocktake_app_users su
    where su.id = p_user_id
      and su.active
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_stocktake_user(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user
      and ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'
  )
  OR exists (
    select 1
    from public.stocktake_app_users su
    where su.id = p_user
      and su.active
  );
$function$;

COMMIT;
