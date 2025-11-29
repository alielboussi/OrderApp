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

## Supabase Edge Functions
All functions are deployed under `https://pojjgbezmwonjzwxspyt.supabase.co/functions/v1/{name}` and require the standard Supabase service role key or a valid JWT depending on usage.

| Function | URL | Purpose |
| --- | --- | --- |
| `stock` | `https://pojjgbezmwonjzwxspyt.supabase.co/functions/v1/stock` | Embedded stock dashboard + stock injection endpoints used inside the Android admin experience. Handles initial, purchase, and closing entries plus log queries. |
| `warehouses` | `https://pojjgbezmwonjzwxspyt.supabase.co/functions/v1/warehouses` | Warehouse/outlet admin utilities: listing warehouses, pulling product catalogs, and resolving default warehouse assignments. |
| `transfer_portal` | `https://pojjgbezmwonjzwxspyt.supabase.co/functions/v1/transfer_portal` | Chrome-friendly portal for outlet transfer requests/testing. Mirrors the Supabase auth + row-level security expectations so QA can verify realtime updates outside the Android app. |

Use these links to verify deployments or trigger curl-based smoke tests when diagnosing Supabase-side issues.
