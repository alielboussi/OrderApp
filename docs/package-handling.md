# Package Contains & Edge Function Reference

## Purchase Packs & Inner Units
- Each product or variation now captures explicitly named purchase fields:
	- **Purchase Pack Unit** (`purchase_pack_unit`): label for the outer package scanned during receiving (e.g., `packet`, `case`).
	- **Units per Purchase Pack** (`units_per_purchase_pack`): how many consumption units live inside one pack.
	- **Purchase Unit Mass** (`purchase_unit_mass` + `purchase_unit_mass_uom`): optional grams/ml/kg metadata for a single consumption unit (e.g., one jar = `750 g`).
	- **Transfer Unit + Quantity** (`transfer_unit`, `transfer_quantity`): defaults used when warehouse teams move stock between locations.
- Warehouse receiving always captures the pack count. When a user scans `1` packet the system multiplies by `units_per_purchase_pack` and records `12` jars (or whatever the pack breakdown is) inside the ledger.
- Outlet and supervisor ordering UIs continue to show the pack mapping as "1 PACK_UNIT = _n_ CONSUMPTION_UOM" so the downstream impact is obvious.
- If `units_per_purchase_pack` is empty or zero the client falls back to `1`, meaning every pack movement equals a single consumption unit.

### Where it appears in the app
- **Product List & Variation dialogs** show "1 PURCHASE_PACK_UNIT = _n_ CONSUMPTION_UOM" plus the optional mass callout ("Each jar = 750 g").
- **Cart Review** surfaces the same line item detail plus a banner reminding users that receiving units convert to consumption units during fulfillment.
- **Supervisor order edits** display the receiving-to-consumption mapping inside each line card and variation picker, so supervisors know the downstream unit impact when swapping variations.
- **Damage logging** always deducts in consumption units (jars, bottles, etc.) regardless of how the stock was received, so writing off "1 jar" never pulls a full packet.

## Transfer Defaults & Warehouse Policies
- Inter-warehouse moves can pin default units via `item_transfer_profiles`. Define the source/destination warehouses, the unit label (jars, bottles, etc.), and the quantity that should pre-fill transfer scanners. This saves time when repeatedly staging the same SKUs between depots.
- `item_warehouse_handling_policies` lets you force gram/ml deductions or mark the warehouse that recipes must draw from. Fields include the warehouse, optional variant, `deduction_uom`, and a `recipe_source` flag.
- Recipes reference the warehouse in two places now:
	- `item_ingredient_recipes.source_warehouse_id` points at the warehouse that physically holds the ingredient.
	- When `recipe_source` is set on a handling policy, all deductions for that item are constrained to the specified warehouse/unit combo even if the outlet normally consumes units.

## Recipe-Driven Ingredient Deduction
- Warehouse admins pre-program recipes per product or variation using `item_ingredient_recipes` (and the scanner-side helpers).
- Each recipe defines the finished good, optional finished variation, ingredient SKU/variant, measurement unit, quantity, and (now) the warehouse it must hit.
- The helper function `recipe_deductions_for_product(product_id, variation_id, qty_units)` emits the exact ingredient totals to subtract from warehouses, taking the warehouse override into account.
- Recipes remain RLS-protected: admins can edit, while transfer managers get read-only access for transparency when balancing stock across depots.

## Vercel Routes (replacing Supabase Edge Functions)
The `Scanners` Next.js app now hosts the HTTP routes that previously lived on Supabase Edge. Once deployed to Vercel, replace `<your-vercel-domain>` with the project domain (for example `afterten-transfers.vercel.app`).

| Route | URL template | Purpose |
| --- | --- | --- |
| `GET /api/warehouses` | `https://<your-vercel-domain>/api/warehouses` | Returns the active warehouse tree for dashboards, supervisors, and the transfer portal. |
| `POST /api/stock` | `https://<your-vercel-domain>/api/stock` | Mirrors the legacy `stock` function: aggregates unit counts for a warehouse + descendants with optional search filtering. |
| `GET /Main_Warehouse_Scanner` | `https://<your-vercel-domain>/Main_Warehouse_Scanner` | Serves the Supabase-authenticated transfer UI used by the main warehouse team for ad-hoc unit movements. |
| `GET /Beverages_Storeroom_Scanner` | `https://<your-vercel-domain>/Beverages_Storeroom_Scanner` | Serves the Supabase-authenticated transfer UI dedicated to the beverages storeroom workflows. |

Deploying a new build to Vercel is now the only step needed to update these endpoints.
