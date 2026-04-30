BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'stock_reason'
      AND e.enumlabel = 'production_entry'
  ) THEN
    ALTER TYPE public.stock_reason ADD VALUE 'production_entry';
  END IF;
END $$;

COMMIT;
