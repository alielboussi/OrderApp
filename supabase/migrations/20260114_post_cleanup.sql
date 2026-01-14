-- Post-cleanup: remove lingering catalog_variants view deps after variant_key cutover
-- Safe to run multiple times; no-op if nothing depends on catalog_variants.

begin;

-- Drop any (materialized) views that still depend on catalog_variants to avoid broken objects
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT v.oid, v.relkind, quote_ident(n.nspname) || '.' || quote_ident(v.relname) AS fqname
    FROM pg_class v
    JOIN pg_namespace n ON n.oid = v.relnamespace
    WHERE v.relkind IN ('v','m')
      AND EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_class t ON t.oid = d.refobjid
        JOIN pg_namespace tn ON tn.oid = t.relnamespace
        WHERE d.objid = v.oid
          AND t.relname = 'catalog_variants'
          AND tn.nspname = 'public'
      )
  LOOP
    EXECUTE 'DROP ' || CASE WHEN rec.relkind = 'm' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END || ' IF EXISTS ' || rec.fqname || ' CASCADE';
  END LOOP;
END$$;

commit;
