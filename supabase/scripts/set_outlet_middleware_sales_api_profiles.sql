-- Tag POS middleware outlets with their sales-export API profile.
-- Till 1 & Till 2 → profile `till`  → GET /api/outlet-middleware-sales/tills
-- Quick Corner   → profile `quick_corner` → GET /api/outlet-middleware-sales/quick-corner
-- Response JSON format is identical on both routes.

ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS middleware_sales_api_profile text;

COMMENT ON COLUMN public.outlets.middleware_sales_api_profile IS
  'Middleware sales export profile: till (Till 1/2) or quick_corner. Drives /api/outlet-middleware-sales/* routing.';

UPDATE public.outlets
SET middleware_sales_api_profile = 'till',
    updated_at = now()
WHERE id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04', -- Till 1
  'a655b0a1-a37a-43d6-aa55-7f97377b2660'  -- Till 2
);

UPDATE public.outlets
SET middleware_sales_api_profile = 'quick_corner',
    updated_at = now()
WHERE id = 'a406fede-7aab-4473-8e9f-ff645267466f'; -- Quick Corner

SELECT id, name, middleware_sales_api_profile, default_sales_warehouse_id
FROM public.outlets
WHERE id IN (
  '648e949d-8648-4c43-80d4-f08feb7bdd04',
  'a655b0a1-a37a-43d6-aa55-7f97377b2660',
  'a406fede-7aab-4473-8e9f-ff645267466f'
)
ORDER BY name;
