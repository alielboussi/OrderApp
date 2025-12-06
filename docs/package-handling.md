# Package Contains & Edge Function Reference

## Package Contains
- Each product or variation stores a `Package Contains` value (persisted as `package_contains` in Supabase). This is the number of individual units inside a single case/package.
- Warehouse teams record stock movements in raw units (initial counts, purchases, stocktakes). No conversion is applied at that layer.
- Outlet and supervisor screens accept quantities in cases. The app multiplies the entered case count by `Package Contains` before creating order items or allocating stock, ensuring the warehouse ledger is debited in units.
- Example: if `Package Contains = 60`, ordering `1` case subtracts `60` units from the warehouse. Ordering `3` cases subtracts `180` units.
- When `Package Contains` is missing or set to zero, the client falls back to `1` so quantities behave like single units.

### Where it appears in the app
- **Product List & Variation dialogs** show "Package Contains: _n_ units" under each item.
- **Cart Review** surfaces the same line item detail plus a banner reminding users that cases convert to units during fulfillment.
- **Supervisor order edits** display package info inside each line card and variation picker, so supervisors know the downstream unit impact when swapping variations.

## Recipe-Driven Ingredient Deduction
- Warehouse admins can now pre-program recipes per product or variation using the `product_recipes` and `product_recipe_ingredients` tables in Supabase.
- Each recipe defines the default warehouse, ingredient product/variation, measurement unit (`grams`, `kilograms`, `milligrams`, `litres`, `millilitres`, or `units`), and quantity deducted per single fulfilled unit.
- The helper function `recipe_deductions_for_product(product_id, variation_id, qty_units)` emits the exact ingredient totals to subtract from warehouses, so future order flows can call it right after booking an order item.
- Recipes are RLS-protected: admins can edit, while transfer managers get read-only access for transparency when balancing stock across depots.

## Vercel Routes (replacing Supabase Edge Functions)
The `Main_Warehouse_Scanner` Next.js app now hosts the HTTP routes that previously lived on Supabase Edge. Once deployed to Vercel, replace `<your-vercel-domain>` with the project domain (for example `afterten-stock.vercel.app`).

| Route | URL template | Purpose |
| --- | --- | --- |
| `GET /api/warehouses` | `https://<your-vercel-domain>/api/warehouses` | Returns the active warehouse tree for dashboards, supervisors, and the transfer portal. |
| `POST /api/stock` | `https://<your-vercel-domain>/api/stock` | Mirrors the legacy `stock` function: aggregates unit counts for a warehouse + descendants with optional search filtering. |
| `GET /Main_Warehouse_Scanner` | `https://<your-vercel-domain>/Main_Warehouse_Scanner` | Serves the Supabase-authenticated transfer UI used by the main warehouse team for ad-hoc unit movements. |
| `GET /Beverages_Storeroom_Scanner` | `https://<your-vercel-domain>/Beverages_Storeroom_Scanner` | Serves the Supabase-authenticated transfer UI dedicated to the beverages storeroom workflows. |

Deploying a new build to Vercel is now the only step needed to update these endpoints.
