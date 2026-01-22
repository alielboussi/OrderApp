# Warehouse Flow Alignment (Main Branch Hub + In-Branch Scanners)

## Current understanding
- Main branch is the hub: 11 cold rooms, 2 raw stores, 1 beverage store, main prep kitchen, plus 3 outlets inside the branch; 18 remote outlets elsewhere.
- Finished beverages: stored centrally, transferred or fulfilled per outlet orders; scanners used for in-branch transfers.
- Kebab prep: raw chicken from specific cold room + other raws from raw store -> mixed/prepped in main prep kitchen -> finished skewers stored in a cold room -> weighed and transferred to in-branch outlets via scanner.
- Bread prep: raws from ingredient store -> baked in main prep kitchen -> packed (e.g., 30 pcs) -> stored in kitchen/cold room -> transferred to in-branch outlets via scanner.
- Remote outlets: place orders in app; supervisor approval auto-deducts from their assigned default warehouses. Variants/ingredients still missing in Quick Corner due to routing/visibility gaps.

- **Storage home (one field):** per item/variant, where it lives and where receipts land. Variants may override the item home (e.g., freezer vs kitchen).
- **Prep/recipe consumption:** pull components from each component's storage home (variant -> item fallback).
- **Sales deduction routing (Warehouse_Backoffice):** per outlet, one shared deduction warehouse (set in Outlet Setup). Route resolution uses `outlet_item_routes` by item + variant key; POS mapping can optionally override via `pos_item_map.warehouse_id`.
- **Stocktake scope:** only ingredients and variants are countable. Base finished items stay hidden; raws excluded.
- **Outlet stocktake alignment:** every inbound move to an outlet (order fulfillment or scanner transfer) must land in that outlet's warehouse so stock periods flow as: opening -> transfers in/out -> sales/damages -> closing, with closing rolling to next opening.
- **Scanners only for in-branch outlets:** use scanners for transfers/damages inside the main branch; remote outlets rely on order approval auto-deduct.
- **Transfer profiles:** allow mapping of source->dest constraints for scanners (e.g., Main Prep Kitchen -> Quick Corner Warehouse).
- **Keep all existing UOMs and units-per-pack fields.**

## Schema adjustments (Supabase)
- **catalog_items.variants**: keep, but enforce `storage_home_id` (or reuse `default_warehouse_id`/`locked_from_warehouse_id` consistently). Normalize variant key with `normalize_variant_key`.
- **warehouses**: tag by role (`storage`, `sales`, `prep`, `virtual`) to guide UI filtering. Existing `kind` can be reused if sufficient.
- **outlets**: add `default_sales_warehouse_id` for remote outlets; for in-branch outlets, still allow per-item/variant overrides.
- **outlet_item_routes**: used for shared outlet deduction warehouse by item+variant. Absence means "cannot deduct" unless overridden by `pos_item_map.warehouse_id`.
- **outlet_products**: keep as visibility gate; ensure variant rows get auto-backfilled (like `insert_variant_routes.sql`).
- **recipes**: keep; consumption warehouse = component storage home. No ingredient-default indirection.
- **stock_ledger**: unchanged; reasons already cover transfers/outlet sales/damages.
- **item_warehouse_handling_policies / transfer profiles**: define allowed source/dest pairs for scanners inside the hub.

## Scanner alignment (in-branch only)
- Scope scanners to in-branch outlets and hub warehouses. Fetch products eligible for:
  - Source warehouse stock OR
  - Destination outlet route OR
  - Variant route for destination
- Variants: include ones whose storage home or destination route matches the scanner dest.
- Ingredients: when a scanned product has a recipe, prompt components using their storage homes; do not require outlet routes.
- Deduction: use the destination selected/locked; transfer source is the scanner's source warehouse (cold room or prep kitchen).

## Warehouse_Backoffice (current UX)
- **Outlet setup**
  1) **Outlet deduction routing:** shared per-outlet warehouse for deductions (ingredients, raws, variants).
  2) **Storage homes:** ingredient and raw storage homes managed in the setup card; variants set in catalog.
  3) **POS mapping:** POS→Catalog map with warehouse override per outlet (optional).

## Immediate fixes to unblock Quick Corner visibility
- Ensure variant rows exist in `outlet_item_routes` and `outlet_products` for the Quick Corner outlet and its warehouse (use `check_variant_routes.sql` and `insert_variant_routes.sql`).
- Allow product fetch to include items that are routed to the destination even if the destination has no stock rows (already adjusted in Quick Corner scanner code).
- Allow variants whose storage home matches source or destination (already adjusted in Quick Corner scanner code).

## Next steps
1) Apply DB backfill: run `insert_variant_routes.sql` (and check script) for the Quick Corner outlet/warehouse.
2) Simplify storage home: converge on one field (`default_warehouse_id`/variant override). Remove ingredient/raw defaults once UI is reworked.
3) Update Outlet Setup UI per plan (three blocks, fewer buttons, clearer hints).
4) Restrict scanners to hub context: filter warehouses/outlets to in-branch lists; hide remote ones.
5) Retest Quick Corner scanner: variants and ingredients should appear after backfill + source/dest filtering.
6) Document final flow and publish to ops.

## Validation checklist (Jan 22 2026)
1) **Outlet defaults**
  - In Outlet Setup, set each remote outlet’s default sales warehouse.
  - Save and refresh to confirm defaults persist.
2) **Quick Corner variant backfill**
  - Update outlet/warehouse IDs in [supabase/check_variant_routes.sql](supabase/check_variant_routes.sql) and [supabase/insert_variant_routes.sql](supabase/insert_variant_routes.sql).
  - Run the check script to see missing variant rows; run insert to backfill.
  - Re-run the check script to confirm rows exist.
3) **Storage homes**
  - Open a product, ingredient, and raw item in Catalog and confirm `storage_home_id` saves and reloads.
  - Verify a variant storage home override appears in the variant editor.
4) **Scanner smoke test (Quick Corner)**
  - Choose source/destination; confirm products/variants appear.
  - Select a product with a recipe; confirm ingredients draw from each component’s storage home.
  - Transfer to an outlet warehouse and confirm stock appears in that outlet warehouse.
5) **Outlet order deduction**
  - For a product with no per-item route, confirm outlet deduction uses the outlet’s default sales warehouse.
  - For a product with per-item or per-variant route, confirm it overrides the outlet default.

## Notes on UOMs
- Preserve existing `purchase_pack_unit`, `transfer_unit`, `consumption_uom`, `units_per_purchase_pack`, `consumption_qty_per_base`, and conversions; do not alter unit definitions.
