-- Only fetch catalog sync events that are ready to apply now.
-- Future scheduled pushes were blocking the pending queue head and starving newer events.

CREATE OR REPLACE FUNCTION public.fetch_outlet_catalog_sync(p_outlet_id uuid, p_limit integer DEFAULT 100)
RETURNS SETOF outlet_catalog_sync_events
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.outlet_catalog_sync_events
  WHERE outlet_id = p_outlet_id
    AND status = 'pending'
    AND (
      payload->>'scheduled_at' IS NULL
      OR NULLIF(trim(payload->>'scheduled_at'), '') IS NULL
      OR (payload->>'scheduled_at')::timestamptz <= now()
    )
  ORDER BY created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$function$;

SELECT 'fetch_outlet_catalog_sync now skips future scheduled events' AS status;
