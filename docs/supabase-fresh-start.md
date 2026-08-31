# Supabase fresh start (no historical data)

Restore the full **Postgres schema** on your new Supabase project, then repopulate from:

1. **Brother stock API** — catalog sync (`catalog_items`, `catalog_variants`, warehouses)
2. **MintPOS** — finished products via SCPGT middleware (`outlet_catalog_sync_events`, `outlet_sales`)
3. **Orders app** — outlets provisioned fresh when ready

Firestore export / `firestore_mirror` import is **optional** and not required for this path.

## Prerequisites

`afterten-website-portal/.env.local`:

```
CLOUD_BACKEND=supabase
SUPABASE_URL=https://uicpjjqhxsjoudwyyxsq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

For automated schema apply (optional):

```
SUPABASE_DB_PASSWORD=...   # Supabase → Project Settings → Database
```

## Step 1 — Mirror staging (already done if you ran it)

`supabase/migrations/20260830100000_firestore_mirror.sql`

## Step 2 — Restore full public schema

The canonical structure is recovered from git as `supabase/Supabase Schema.sql` (JSON export).

Regenerate executable SQL:

```powershell
cd C:\Projects\Afterten
node supabase/scripts/generate-schema-sql-from-export.cjs
```

This writes:

`supabase/migrations/20260830110000_restore_public_schema.sql`

**Apply** (pick one):

### A — Supabase SQL Editor (no CLI)

1. Open **SQL Editor** in your project
2. Paste and run `20260830110000_restore_public_schema.sql`
3. Paste and run `supabase/migrations/20260729_outlet_cashiers.sql`

### B — psql with database password

```powershell
$env:SUPABASE_DB_PASSWORD = "your-database-password"
node firebase/scripts/apply-supabase-schema.cjs
```

### C — Supabase CLI (if logged in)

```powershell
supabase login
supabase link --project-ref uicpjjqhxsjoudwyyxsq
supabase db push
```

## Step 3 — Verify empty tables exist

```powershell
node firebase/scripts/inspect-supabase.cjs
```

You should see `catalog_items: 0`, `orders: 0`, etc. — **not** `(missing)`.

## Step 4 — Brother catalog sync

```powershell
node firebase/scripts/stock-catalog-sync-supabase.cjs
```

Uses `STOCK_SYNC_API_TOKEN` or `Afterten_Purchases_Api_Token` from `.env.local`. All products import as `item_kind = ingredient`.

## Step 5 — MintPOS finished products + variants

**You do not need Node or this repo on the till.** See `docs/mintpos-catalog-export-without-node.md`.

Quick version:

1. Copy `pos-sync-service/scripts/Export-MintPosCatalog.ps1` to the till → run it → get `Desktop\mintpos-catalog-export.json`
2. On your dev PC:

```powershell
node firebase/scripts/mintpos-catalog-import-supabase.cjs --from-json exports/mintpos/catalog.json
```

### Option A — live SQL from dev PC (only if till SQL is reachable on your network)

Set in `.env.local`:

```
MINTPOS_DB_SERVER=TILL_PC_NAME_OR_IP
MINTPOS_DB_DATABASE=MINTPOS
MINTPOS_DB_USERNAME=...
MINTPOS_DB_PASSWORD=...
```

```powershell
node firebase/scripts/mintpos-catalog-import-supabase.cjs
```

### Option B — offline JSON from till (recommended)

See `docs/mintpos-catalog-export-without-node.md`.

Dry run: add `--dry-run`.

After import, point SCPGT at Supabase when ready.

## Step 6 — Outlets / orders (when ready)

Re-provision outlets fresh (no Firebase dependency):

- `firebase/scripts/provision-orders-outlets.cjs` (needs Supabase adapter)
- Or create outlets in portal backoffice once portal reads/writes Supabase

## Files

| File | Purpose |
|------|---------|
| `supabase/Supabase Schema.sql` | JSON schema export (source of truth) |
| `supabase/scripts/generate-schema-sql-from-export.cjs` | JSON → DDL |
| `supabase/migrations/20260830110000_restore_public_schema.sql` | Generated DDL (~26 tables, 85 functions) |
| `supabase/migrations/20260729_outlet_cashiers.sql` | Cashiers table + sync queue |
| `firebase/scripts/apply-supabase-schema.cjs` | Apply via psql when `SUPABASE_DB_PASSWORD` set |
| `firebase/scripts/inspect-supabase.cjs` | Table counts + mirror summary |

## Optional — Firestore historical import

Only if you change your mind later:

```powershell
node firebase/scripts/export-firestore-essentials.cjs
node firebase/scripts/import-firestore-to-supabase.cjs
```

Currently blocked by Firebase Spark quota (`RESOURCE_EXHAUSTED`).
