# Simplified POS sync — schema and migration guide

## What changed

| Area | Before | After |
|------|--------|-------|
| POS item linking | Per-outlet `pos_item_map` (manual MintPOS id → catalog) | **SKU match**: `MenuItem.Code` = `catalog_items.sku`, variant SKU in `ModifierFlavour.Name2` |
| Middleware scope | Sales + stock period windows + inventory consumed | **Sales upload + catalog push + heartbeat**; sync window from stocktake counters |
| Stock periods | Middleware read `counter_values` for sync open/cutoff | **Afterten Orders app** opens/closes periods; middleware reads `pos_sync_opening` / `pos_sync_cutoff` |
| Offline detection | None | `outlet_pos_heartbeats` — dashboard alert after 10 min |
| Catalog updates | Manual POS entry | `outlet_catalog_sync_events` queue → middleware updates POS |

## Migration order

Apply in this sequence:

1. `supabase/migrations/20260616120000_simplified_pos_sync.sql` — POS sync, heartbeats, SKU resolution
2. `supabase/migrations/20260616140000_remove_recipes_production.sql` — **destructive** recipe/production drop
3. `supabase/migrations/20260616160000_outlet_scope_and_pos_deduction_rules.sql` — hub vs outlet scope, programmable POS deductions, live balance views

See `docs/outlet-middleware-orders-architecture.md` for how outlets, outlet warehouses, and middleware fit together.

## Step 1 — Apply simplified POS sync (first migration)

Run the SQL in:

`supabase/migrations/20260616120000_simplified_pos_sync.sql`

via Supabase SQL editor or CLI:

```bash
supabase db push
```

This creates:

- `outlet_pos_heartbeats`
- `outlet_catalog_sync_events`
- `resolve_catalog_by_sku()`
- Updated `validate_pos_order` / `sync_pos_order` (no stock period gate, SKU resolution)

## Step 2 — Remove recipes & production (second migration)

Run `supabase/migrations/20260616140000_remove_recipes_production.sql` — drops recipe/production tables. Backup first.

## Step 3 — Outlet scope & POS sale deductions (third migration)

Run `supabase/migrations/20260616160000_outlet_scope_and_pos_deduction_rules.sql`. Adds:

- `warehouses.warehouse_scope` (`hub` | `outlet`)
- `outlets.has_pos_middleware`
- `outlet_pos_deduction_rules` + `apply_pos_sale_deduction_rules()` (wired into `sync_pos_order`)
- Views for filtering and live balances

## Step 4 — Ensure every catalog item has a SKU

Every sellable item needs a unique SKU (case-insensitive unique index already exists on `catalog_items.sku`).

Recommended convention:

- **Base item**: human SKU e.g. `OMLETTE-001` or the item UUID string
- **Variant**: unique variant SKU e.g. `OMLETTE-001-VANILLA` or variant UUID

```sql
-- Example: backfill missing SKUs from item id
UPDATE catalog_items SET sku = id::text WHERE sku IS NULL OR trim(sku) = '';

UPDATE catalog_variants cv
SET sku = cv.id
WHERE sku IS NULL OR trim(sku) = '';
```

## Step 5 — Migrate from pos_item_map (optional one-time)

If you have existing `pos_item_map` rows, copy SKUs onto catalog items before decommissioning the table:

```sql
UPDATE catalog_items ci
SET sku = COALESCE(NULLIF(trim(ci.sku), ''), pim.catalog_item_id::text)
FROM pos_item_map pim
WHERE pim.catalog_item_id = ci.id;
```

Then push catalog to POS (Step 4). After all outlets sync, `pos_item_map` can be dropped in a follow-up migration.

## Step 6 — Push catalog to all outlets

When you save an item or variant in the backoffice, enqueue sync events:

```sql
SELECT public.enqueue_catalog_sync_for_outlets(
  'item',
  '<catalog_item_id>',
  jsonb_build_object(
    'sku', '<sku>',
    'name', '<name>',
    'price', 150.00
  )
);
```

Middleware polls pending events each cycle and updates `MenuItem` / `ModifierFlavour` on the local POS database.

## Step 7 — Deploy updated middleware

Rebuild and redeploy `pos-sync-service` on each outlet machine.

Changes:

- Sends heartbeat every poll cycle
- Pulls catalog sync queue
- Sends `item_sku` / `variant_sku` on each sale line
- Reads `pos_sync_opening` / `pos_sync_cutoff` from `counter_values` (set by Outlet Stocktake in Android app)
- Marks `BillType`, `Sale`, `Saledetails` as `Processed` after successful upload (unchanged)

Run updated POS permissions script on each SQL Server:

`pos-sync-service/scripts/POS_SQL_Permissions.sql`

## Step 8 — Verify a test sale

1. Confirm `MenuItem.Code` on POS matches a catalog SKU
2. Punch a sale
3. Check Supabase:
   - `orders` row with `source_event_id`
   - `outlet_sales` rows with `context` containing item/variant UUID, SKU, outlet name
4. Confirm POS rows show `uploadStatus = 'Processed'`
5. Confirm `outlet_pos_heartbeats.last_seen_at` updates within one poll interval

## Tables safe to consolidate later

These remain for warehouse/stocktake flows but are **not** used by simplified middleware:

| Table | Notes |
|-------|-------|
| `pos_item_map` | Deprecated after SKU rollout |
| `counter_values` (pos_sync_*) | Read by middleware for sales sync window (per outlet) |
| `pos_inventory_consumed` | Optional; middleware still sends but sync RPC no longer depends on it for stock period |

Future consolidation candidates (separate migration):

- Merge `outlet_order_routes` + `outlet_item_routes` into single `outlet_deduction_routes`
- Archive `pos_sync_failures` older than 90 days via scheduled job

## Dashboard

After login, the main dashboard shows signed-in email/username and red alerts for outlets with no heartbeat in 10+ minutes.

## Questions?

If your POS uses a different column than `MenuItem.Code` for SKU, tell us which column and we can align the middleware read/write paths.
