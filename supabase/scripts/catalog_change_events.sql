-- Structured catalog change feed for backoffice API operations.
-- Populated from catalog API routes; read via GET /api/catalog/changes

CREATE TABLE IF NOT EXISTS public.catalog_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  change_type text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('item', 'variant', 'menu_group')),
  entity_id text NOT NULL,
  entity_name text,
  sku text,
  menu_group_id uuid,
  item_id uuid,
  actor_user_id uuid,
  actor_email text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot jsonb,
  source text NOT NULL DEFAULT 'backoffice_api'
);

CREATE INDEX IF NOT EXISTS catalog_change_events_created_at_idx
  ON public.catalog_change_events (created_at DESC);

CREATE INDEX IF NOT EXISTS catalog_change_events_change_type_idx
  ON public.catalog_change_events (change_type);

CREATE INDEX IF NOT EXISTS catalog_change_events_entity_type_idx
  ON public.catalog_change_events (entity_type);

CREATE INDEX IF NOT EXISTS catalog_change_events_entity_id_idx
  ON public.catalog_change_events (entity_id);

ALTER TABLE public.catalog_change_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_change_events_service ON public.catalog_change_events;
CREATE POLICY catalog_change_events_service
  ON public.catalog_change_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS catalog_change_events_authenticated_read ON public.catalog_change_events;
CREATE POLICY catalog_change_events_authenticated_read
  ON public.catalog_change_events
  FOR SELECT
  TO authenticated
  USING (true);

GRANT ALL ON TABLE public.catalog_change_events TO service_role;
GRANT SELECT ON TABLE public.catalog_change_events TO authenticated;
