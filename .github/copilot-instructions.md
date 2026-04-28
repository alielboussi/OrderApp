# Copilot instructions

## Big picture architecture
- Monorepo with three primary apps:
  - Android app (Jetpack Compose) in app/ that authenticates via custom outlet RPCs (no Supabase Auth). See [README.md](README.md).
  - Next.js “Scanners/Warehouse Backoffice” app in Scanners/ that uses Supabase anon in the browser and service-role in API routes. See [Scanners/README.md](Scanners/README.md).
  - .NET 8 Windows Service in pos-sync-service/ that polls POS SQL Server and posts to Supabase RPCs. See [pos-sync-service/README.md](pos-sync-service/README.md).
- Supabase is the system of record. ALWAYS cross-check tables/RPCs against the latest schema in [supabase/Supabase Schema.sql](supabase/Supabase%20Schema.sql) before changing queries or adding new ones.

## Data flows & boundaries
- POS → Supabase: Windows service calls `sync_pos_order(payload jsonb)` and related RPCs (schema file). See [pos-sync-service/README.md](pos-sync-service/README.md).
- Warehouse/Backoffice UI → Supabase:
  - Browser uses anon key via [Scanners/src/lib/supabase-browser.ts](Scanners/src/lib/supabase-browser.ts).
  - Server/API routes use service-role via [Scanners/src/lib/supabase-server.ts](Scanners/src/lib/supabase-server.ts).
  - Outlet scoping uses `whoami_roles` / `whoami_outlet` RPCs.
- Live balances view should read from `outlet_stock_summary` (view over `outlet_stock_balances`) and map outlets via `outlet_warehouses` (see schema file).

## Developer workflows
- Android app: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in gradle.properties, then run in Android Studio. See [README.md](README.md).
- Scanners (Next.js): `cp Scanners/.env.example Scanners/.env.local`, `npm install`, `npm run dev`. See [Scanners/README.md](Scanners/README.md).
- POS sync service: `dotnet publish -c Release -r win-x64 --self-contained true -o publish`; install via PowerShell script. See [pos-sync-service/README.md](pos-sync-service/README.md).

## Project-specific conventions
- Prefer Supabase RPCs/views over raw table joins when they exist (check schema file first).
- Use `whoami_roles` for outlet scope in UI pages; only fall back to `whoami_outlet` if needed.
- For warehouse stock UI, keep “rollup” logic at the query layer (e.g., `outlet_stock_summary` view) and only aggregate across selected outlets/warehouses in the UI.
- Quick Corner item visibility depends on `item_storage_homes` for `storage_warehouse_id = 587fcdb9-c998-42d6-b88e-bbcd1a66b088`; when adding new products/variants to Quick Corner, insert matching `item_storage_homes` rows (use `warehouse_stock_items` + `normalize_variant_key` to seed variant keys for items with stock).
- Quick Corner transfer-only items are listed in `TRANSFER_REQUIRED_PRODUCT_IDS` in [Scanners/src/app/Quick_Corner_Scanner/route.ts](Scanners/src/app/Quick_Corner_Scanner/route.ts) and only appear after transfers from `0c9ddd9e-d42c-475f-9232-5e9d649b0916` to `587fcdb9-c998-42d6-b88e-bbcd1a66b088`; add new item IDs there and seed `item_storage_homes` for each variant you expect to show.

## Integration points
- Twilio WhatsApp notifications live in Scanners API routes. See [Scanners/README.md](Scanners/README.md).
- Storage buckets and JWT secrets are configured in Supabase (see root README).

## When editing data queries
- Confirm table/column names and RPC signatures in [supabase/Supabase Schema.sql](supabase/Supabase%20Schema.sql).
- Match item/variant keys using `normalize_variant_key` semantics (see schema file).