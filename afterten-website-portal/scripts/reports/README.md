# Stock Control reports

## `catalog-missing-in-stock-api.csv`

Portal catalog products/variants whose UUID is **not present** in the Afterten Stock API (`/sync/stock`).

Regenerate:

```powershell
$env:STOCK_SYNC_API_TOKEN="<token>"
node "afterten-website-portal/scripts/stock-control-alignment.mjs" `
  --csv "afterten-website-portal/scripts/reports/catalog-missing-in-stock-api.csv"
```

Columns:
- `kind` — `product` or `variant`
- `catalog_id` — Firestore doc id (same as stock UUID when aligned)
- `product_id` — parent `catalog_items.id`
- `variant_id` — `catalog_variants.id` when variant
- `name` — display name in portal
- `stock_uuid` — UUID Stock Control expects in the stock API

## Stock catalog cleanup

Dry run:

```powershell
$env:STOCK_SYNC_API_TOKEN="<token>"
node "afterten-website-portal/scripts/stock-catalog-cleanup.mjs"
```

Apply deletions:

```powershell
node "afterten-website-portal/scripts/stock-catalog-cleanup.mjs" --apply
```

Portal API (warehouse auth):

- `GET /api/catalog/stock-api-cleanup` — cleanup plan
- `POST /api/catalog/stock-api-cleanup?apply=true` — run cleanup + refresh outlet catalogs

## Stock catalog sync

Portal catalog UUIDs are synced from `GET /sync/catalog` (source of truth).

```powershell
$env:STOCK_SYNC_API_TOKEN="<token>"
node "afterten-website-portal/scripts/stock-catalog-sync.mjs"
```

Optional: deactivate portal rows missing from the API:

```powershell
node "afterten-website-portal/scripts/stock-catalog-sync.mjs" --deactivate-missing
```

Portal API (warehouse auth):

- `GET /api/catalog/stock-api-sync` — last sync report
- `POST /api/catalog/stock-api-sync` — run sync now

Env flags (server-side only):

- `STOCK_CATALOG_SYNC_ENABLED=true` — enables **manual** portal/callable sync only (scheduled `syncStockCatalogScheduled` was removed)
- `STOCK_CATALOG_SYNC_DEACTIVATE_MISSING=true` — mark portal-only UUIDs inactive during sync

## Brother stock API report

Only items your brother must fix on the stock system (not portal cleanup):

```powershell
$env:STOCK_SYNC_API_TOKEN="<token>"
node "afterten-website-portal/scripts/stock-api-brother-report.mjs"
```

Export CSV to send him:

```powershell
node "afterten-website-portal/scripts/stock-api-brother-report.mjs" `
  --csv "afterten-website-portal/scripts/reports/brother-stock-gaps.csv"
```
