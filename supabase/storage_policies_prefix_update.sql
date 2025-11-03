-- Update storage INSERT policies to use path_tokens[1] for outlet prefix checks
-- Run as the storage schema owner (who owns storage.objects)
-- Idempotent and safe: drops and recreates only the two INSERT policies.

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not found; skipping policy update';
    RETURN;
  END IF;

  -- Drop existing INSERT policies (if present)
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "insert_orders_by_outlet_prefix" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "insert_signatures_by_outlet_prefix" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  -- Recreate: orders INSERT policy using path_tokens
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
          FROM unnest(public.member_outlet_ids(auth.uid())) AS oid
          WHERE path_tokens[1] = oid::text
        )
      )
      AND name ~ '^[0-9a-fA-F-]+/.+'
    );
  $sp$;

  -- Recreate: signatures INSERT policy using path_tokens
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
          FROM unnest(public.member_outlet_ids(auth.uid())) AS oid
          WHERE path_tokens[1] = oid::text
        )
      )
      AND name ~ '^[0-9a-fA-F-]+/.+'
    );
  $sp$;
END
$$;