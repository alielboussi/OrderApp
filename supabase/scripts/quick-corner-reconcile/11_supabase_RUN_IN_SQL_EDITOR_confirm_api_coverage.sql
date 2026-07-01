-- =============================================================================
-- STEP 11 — FINAL VERIFICATION (⚠️ SUPABASE SQL EDITOR ONLY — not SSMS)
-- =============================================================================
-- Quick Corner outlet: a406fede-7aab-4473-8e9f-ff645267466f
--
-- PREREQUISITES (already done — do NOT re-run unless verification fails):
--   • 12a — sync_pos_order / validate_pos_order fixes
--   • 12b — empty order shells deleted
--   • 12c — MintPOS bills re-queued to Pending (one-time)
--   • New SCPGT.exe deployed + draining the queue
--
-- PAIR WITH (read-only on Quick Corner PC):
--   11_mintpos_RUN_ON_QUICKCORNER_PC_confirm_exportable_sales.sql
--
-- API CHECK (browser, after Vercel deploy):
--   https://aftertentransfers.app/api/outlet-middleware-sales/quick-corner
--   JSON field "sales_count" must match bills_with_api_lines below.
--
-- TARGETS WHEN FULLY SYNCED:
--   bills_with_api_lines          ≈ exportable_bills_total from MintPOS 11-A (~7,375)
--   orders_missing_api_lines      = 0
--   orders_in_supabase            ≈ bills_with_api_lines (not 65k+)
--   max_bill_id_with_api_lines    = max_pos_bill_id from MintPOS 11-A
--
-- Run one query block at a time (highlight → Run).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Query A) Coverage summary — compare to MintPOS 11-A
-- -----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*)
   FROM public.orders o
   WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
  ) AS orders_in_supabase,
  (SELECT COUNT(DISTINCT os.context->>'source_event_id')
   FROM public.outlet_sales os
   WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND os.context->>'source_event_id' IS NOT NULL
  ) AS bills_with_api_lines,
  (SELECT MAX(replace(o.source_event_id, 'a406fede-7aab-4473-8e9f-ff645267466f-', '')::bigint)
   FROM public.orders o
   WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
  ) AS max_bill_id_in_orders,
  (SELECT MAX(replace(os.context->>'source_event_id', 'a406fede-7aab-4473-8e9f-ff645267466f-', '')::bigint)
   FROM public.outlet_sales os
   WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND os.context->>'source_event_id' IS NOT NULL
  ) AS max_bill_id_with_api_lines,
  (SELECT COUNT(*)
   FROM public.orders o
   WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
     AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
     AND NOT EXISTS (
       SELECT 1 FROM public.outlet_sales os
       WHERE os.context->>'source_event_id' = o.source_event_id
     )
  ) AS orders_missing_api_lines;


-- -----------------------------------------------------------------------------
-- Query B) PASS / FAIL verdict (single row)
-- -----------------------------------------------------------------------------
WITH metrics AS (
  SELECT
    (SELECT COUNT(DISTINCT os.context->>'source_event_id')
     FROM public.outlet_sales os
     WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
       AND os.context->>'source_event_id' IS NOT NULL
    ) AS bills_with_api_lines,
    (SELECT COUNT(*)
     FROM public.orders o
     WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
       AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
       AND NOT EXISTS (
         SELECT 1 FROM public.outlet_sales os
         WHERE os.context->>'source_event_id' = o.source_event_id
       )
    ) AS orders_missing_api_lines,
    (SELECT COUNT(*)
     FROM public.orders o
     WHERE o.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
       AND o.source_event_id LIKE 'a406fede-7aab-4473-8e9f-ff645267466f-%'
    ) AS orders_in_supabase
)
SELECT
  bills_with_api_lines,
  orders_missing_api_lines,
  orders_in_supabase,
  CASE
    WHEN orders_missing_api_lines = 0
     AND bills_with_api_lines >= 7000
     AND abs(orders_in_supabase - bills_with_api_lines) <= 50
    THEN 'PASS — matches MintPOS exportable bills; check API sales_count'
    WHEN orders_missing_api_lines > 0
    THEN 'FAIL — empty order shells remain; re-run 12b DELETE or wait for SCPGT backfill'
    WHEN bills_with_api_lines < 7000
    THEN 'IN PROGRESS — SCPGT still draining; re-run after queue hits 0 on MintPOS'
    ELSE 'REVIEW — counts diverge; run Query D + 07_sync_failures'
  END AS verdict
FROM metrics;


-- -----------------------------------------------------------------------------
-- Query C) Spot-check latest bill — edit pos_bill_id to MintPOS max_pos_bill_id
-- -----------------------------------------------------------------------------
SELECT
  '1393227'::text AS pos_bill_id,
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.source_event_id = 'a406fede-7aab-4473-8e9f-ff645267466f-1393227'
  ) AS in_orders,
  EXISTS (
    SELECT 1 FROM public.outlet_sales os
    WHERE os.context->>'source_event_id' = 'a406fede-7aab-4473-8e9f-ff645267466f-1393227'
  ) AS in_api_outlet_sales,
  (SELECT COUNT(*) FROM public.outlet_sales os
   WHERE os.context->>'source_event_id' = 'a406fede-7aab-4473-8e9f-ff645267466f-1393227'
  ) AS api_line_rows;


-- -----------------------------------------------------------------------------
-- Query D) Latest 10 bills WITH API lines (what website/API consumers see)
-- -----------------------------------------------------------------------------
SELECT
  replace(os.context->>'source_event_id', 'a406fede-7aab-4473-8e9f-ff645267466f-', '') AS pos_bill_id,
  MAX(os.sold_at) AS last_line_sold_at,
  COUNT(*) AS api_line_rows
FROM public.outlet_sales os
WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
  AND os.context->>'source_event_id' IS NOT NULL
GROUP BY os.context->>'source_event_id'
ORDER BY MAX(os.sold_at) DESC
LIMIT 10;


-- -----------------------------------------------------------------------------
-- Query E) Bills with API lines but NO order header (should be 0)
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS api_lines_without_order_header
FROM (
  SELECT DISTINCT os.context->>'source_event_id' AS source_event_id
  FROM public.outlet_sales os
  WHERE os.outlet_id = 'a406fede-7aab-4473-8e9f-ff645267466f'
    AND os.context->>'source_event_id' IS NOT NULL
) api_bills
WHERE NOT EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.source_event_id = api_bills.source_event_id
);
