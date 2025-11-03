-- Storage policies for per-outlet scoped paths
-- Run this script as the storage schema owner (the role that owns storage.objects)
-- Idempotent: drops prior overlapping policies if present, then creates tightened ones.

-- Notes:
-- - We enforce that authenticated users can INSERT only to:
--   - orders/<outlet_id>/... where outlet_id is in member_outlet_ids(auth.uid())
--   - signatures/<outlet_id>/... with the same constraint
-- - Admins (public.is_admin(auth.uid())) can INSERT anywhere in these buckets.
-- - UPDATE and DELETE remain admin-only.
-- - Reads continue to use signed URLs and are unchanged here.

-- Safety: Only proceed if storage.objects exists
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not found; skipping storage policy creation';
    RETURN;
  END IF;

  -- Drop older broad policies if they exist
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "authenticated_insert_limited_buckets" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  -- Drop tightened policies if they exist (for idempotency)
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "insert_orders_by_outlet_prefix" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "insert_signatures_by_outlet_prefix" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "admin_update_storage_objects" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "admin_delete_storage_objects" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  -- Create tightened INSERT policy for orders bucket
  EXECUTE $sp$
    CREATE POLICY "insert_orders_by_outlet_prefix"
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'orders'
      AND (
        public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.member_outlet_ids(auth.uid()) AS o(outlet_id)
          WHERE split_part(name, '/', 1) = o.outlet_id::text
        )
      )
      -- Optional: ensure name starts with a UUID-like segment
      AND name ~ '^[0-9a-fA-F-]+/.+'
    );
  $sp$;

  -- Create tightened INSERT policy for signatures bucket
  EXECUTE $sp$
    CREATE POLICY "insert_signatures_by_outlet_prefix"
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'signatures'
      AND (
        public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.member_outlet_ids(auth.uid()) AS o(outlet_id)
          WHERE split_part(name, '/', 1) = o.outlet_id::text
        )
      )
      AND name ~ '^[0-9a-fA-F-]+/.+'
    );
  $sp$;

  -- Admin-only UPDATE
  EXECUTE $sp$
    CREATE POLICY "admin_update_storage_objects"
    ON storage.objects
    FOR UPDATE TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
  $sp$;

  -- Admin-only DELETE
  EXECUTE $sp$
    CREATE POLICY "admin_delete_storage_objects"
    ON storage.objects
    FOR DELETE TO authenticated
    USING (public.is_admin(auth.uid()));
  $sp$;

END
$$;