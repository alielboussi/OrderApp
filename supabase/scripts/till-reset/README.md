# Till reset & catalog verify

## Before middleware (Till 1 / Till 2)

Run in order in **Supabase SQL Editor** / **MintPOS SSMS**:

| Script | Where |
|--------|-------|
| `00_preflight_tills_vs_quick_corner.sql` | Supabase |
| `01_supabase_wipe_till1_till2_sales.sql` | Supabase |
| `02_supabase_verify_till_wipe.sql` | Supabase |
| `04_mintpos_reset_sales_to_pending.sql` | MintPOS (each till PC) |

Till 2 only variants: `01b_supabase_wipe_till2_only.sql`, `02b_supabase_verify_till2_wipe.sql`

## JSON catalog export (compare tills vs Supabase)

| Script | Where |
|--------|-------|
| `20_mintpos_catalog_json_export.sql` | MintPOS — set `@outlet_label` per PC |
| `21_supabase_catalog_json_export.sql` | Supabase |

## Final catalog cleanup (optional)

After JSON compare passes, on MintPOS PCs:

| Script | Where |
|--------|-------|
| `26_mintpos_till1_cleanup_orphans.sql` | Till 1 — remove products without SKU |
| `26b_mintpos_till2_cleanup_orphans.sql` | Till 2 — remove products without SKU |
| `27_mintpos_till2_align_labels_to_till1.sql` | Till 2 — cosmetic name alignment |
| `28_mintpos_catalog_prices_export.sql` | MintPOS — export GrossPrice per outlet |
| `29_supabase_import_mintpos_prices.sql` | Supabase — import prices from script 28 JSON |

Re-run script 20 on each till to confirm `products_missing_sku = 0`.

Copy the `catalog_json` cell from each run and compare SKUs / group IDs.

## Schema reference

- `supabase/Supabase Schema.sql`
- `supabase/Point Of Sale Schema.sql`
- `supabase/migrations/*.sql`
