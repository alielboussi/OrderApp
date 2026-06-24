-- Remove warehouse purchase receipts, line items, API import tracking, and related functions.
-- Run in Supabase SQL editor after deploying app changes that no longer use purchases.

-- Functions first (they reference purchase tables).
DROP FUNCTION IF EXISTS public.record_purchase_receipt(
  uuid,
  jsonb,
  uuid,
  text,
  text,
  boolean
);

DROP FUNCTION IF EXISTS public.next_purchase_receipt_reference();

-- RLS policies (if present).
DROP POLICY IF EXISTS warehouse_purchase_items_authenticated_select ON public.warehouse_purchase_items;
DROP POLICY IF EXISTS warehouse_purchase_receipts_authenticated_select ON public.warehouse_purchase_receipts;

-- Child tables before parent receipts.
DROP TABLE IF EXISTS public.warehouse_purchase_imports;
DROP TABLE IF EXISTS public.warehouse_purchase_items;
DROP TABLE IF EXISTS public.warehouse_purchase_receipts;

-- Receipt counter used by next_purchase_receipt_reference().
DELETE FROM public.counter_values
WHERE counter_key = 'purchase_receipt';
