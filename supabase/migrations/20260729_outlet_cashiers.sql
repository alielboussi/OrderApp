-- Outlet cashiers: portal source of truth with middleware sync queue to MintPOS Users.

CREATE TABLE IF NOT EXISTS public.outlet_cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  name text NOT NULL,
  username text NOT NULL,
  user_type text NOT NULL DEFAULT 'Cashier',
  pos_user_id integer,
  sync_status text NOT NULL DEFAULT 'pending_insert',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  CONSTRAINT outlet_cashiers_sync_status_check CHECK (
    sync_status IN ('pending_insert', 'synced', 'pending_delete', 'deleted')
  ),
  CONSTRAINT outlet_cashiers_user_type_check CHECK (user_type = 'Cashier')
);

CREATE UNIQUE INDEX IF NOT EXISTS outlet_cashiers_outlet_username_unique
  ON public.outlet_cashiers (outlet_id, lower(username))
  WHERE active = true AND sync_status <> 'deleted';

CREATE UNIQUE INDEX IF NOT EXISTS outlet_cashiers_outlet_pos_user_unique
  ON public.outlet_cashiers (outlet_id, pos_user_id)
  WHERE pos_user_id IS NOT NULL AND active = true AND sync_status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_outlet_cashiers_outlet_active
  ON public.outlet_cashiers (outlet_id, active, sync_status);

CREATE TABLE IF NOT EXISTS public.outlet_cashier_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  cashier_id uuid REFERENCES public.outlet_cashiers(id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  error_message text,
  CONSTRAINT outlet_cashier_sync_events_action_check CHECK (
    action IN ('insert', 'delete', 'pull')
  ),
  CONSTRAINT outlet_cashier_sync_events_status_check CHECK (
    status IN ('pending', 'delivered', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_outlet_cashier_sync_pending
  ON public.outlet_cashier_sync_events (outlet_id, status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.outlet_cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_cashier_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_cashiers_service ON public.outlet_cashiers;
CREATE POLICY outlet_cashiers_service ON public.outlet_cashiers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS outlet_cashier_sync_events_service ON public.outlet_cashier_sync_events;
CREATE POLICY outlet_cashier_sync_events_service ON public.outlet_cashier_sync_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS outlet_cashiers_authenticated_select ON public.outlet_cashiers;
CREATE POLICY outlet_cashiers_authenticated_select ON public.outlet_cashiers
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.fetch_outlet_cashier_sync(
  p_outlet_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.outlet_cashier_sync_events
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT *
  FROM public.outlet_cashier_sync_events
  WHERE outlet_id = p_outlet_id
    AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

CREATE OR REPLACE FUNCTION public.mark_cashier_sync_delivered(
  p_event_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.outlet_cashier_sync_events
  SET status = 'delivered', delivered_at = now(), error_message = NULL
  WHERE id = ANY(p_event_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_cashier_sync_failed(
  p_event_id uuid,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.outlet_cashier_sync_events
  SET status = 'failed', error_message = left(coalesce(p_error_message, 'unknown error'), 2000)
  WHERE id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_cashier_insert_sync(
  p_cashier_id uuid,
  p_pos_user_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.outlet_cashiers
  SET
    pos_user_id = p_pos_user_id,
    sync_status = 'synced',
    last_synced_at = now(),
    updated_at = now()
  WHERE id = p_cashier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_cashier_delete_sync(
  p_cashier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.outlet_cashiers
  SET
    active = false,
    sync_status = 'deleted',
    last_synced_at = now(),
    updated_at = now()
  WHERE id = p_cashier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_outlet_cashiers_from_pos(
  p_outlet_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_upserted int := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  WITH src AS (
    SELECT
      nullif(trim(r.pos_user_id::text), '')::integer AS pos_user_id,
      nullif(trim(r.name), '') AS name,
      nullif(trim(r.username), '') AS username,
      coalesce(nullif(trim(r.user_type), ''), 'Cashier') AS user_type
    FROM jsonb_to_recordset(p_rows) AS r(
      pos_user_id integer,
      name text,
      username text,
      user_type text
    )
    WHERE nullif(trim(r.username), '') IS NOT NULL
      AND nullif(trim(r.name), '') IS NOT NULL
      AND r.pos_user_id IS NOT NULL
  ),
  matched AS (
    UPDATE public.outlet_cashiers oc
    SET
      name = src.name,
      username = src.username,
      user_type = src.user_type,
      pos_user_id = src.pos_user_id,
      sync_status = 'synced',
      active = true,
      last_synced_at = now(),
      updated_at = now()
    FROM src
    WHERE oc.outlet_id = p_outlet_id
      AND (
        oc.pos_user_id = src.pos_user_id
        OR lower(oc.username) = lower(src.username)
      )
    RETURNING oc.id
  ),
  inserted AS (
    INSERT INTO public.outlet_cashiers (
      outlet_id, name, username, user_type, pos_user_id, sync_status, active, last_synced_at
    )
    SELECT
      p_outlet_id,
      src.name,
      src.username,
      src.user_type,
      src.pos_user_id,
      'synced',
      true,
      now()
    FROM src
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.outlet_cashiers oc
      WHERE oc.outlet_id = p_outlet_id
        AND (
          oc.pos_user_id = src.pos_user_id
          OR lower(oc.username) = lower(src.username)
        )
    )
    RETURNING id
  )
  SELECT count(*) INTO v_upserted FROM (
    SELECT id FROM matched
    UNION ALL
    SELECT id FROM inserted
  ) combined;

  RETURN jsonb_build_object('upserted', v_upserted);
END;
$$;
