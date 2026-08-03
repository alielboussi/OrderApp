# Firebase cutover plan (portal + POS middleware)

**Goal:** Run the warehouse backoffice portal and POS sync middleware entirely on Firebase so Supabase can be deleted.

**Out of scope:** Afterten Orders App legacy Kotlin, stocktake Android app, brother's inventory/stock-period systems.

---

## Current state

| Layer | Status |
|-------|--------|
| Portal catalog, outlets, cashiers, middleware status | Firebase-ready (dual-backend) |
| Portal inventory/reporting APIs | Wired to Firestore |
| Portal auth | Firebase Auth when `CLOUD_BACKEND=firebase` |
| Operational data migrated | Auth accounts (3), logs (407); stock/orders/traces empty in source |
| **11 portal APIs** | Still Supabase-only (recipes, scanners, pos-item-map, etc.) |
| **pos-sync-service** | Defaults to Firebase; sales/catalog/heartbeat path on Firestore |
| Historical POS sales | Not backfilled to `pos_sales/{outletId}/bills` |

---

## Phase 1 — Data import (run once)

From `firebase/` folder:

```bash
# Preview
DRY_RUN=1 node scripts/migrate-all-portal-data-from-supabase.cjs

# Execute (reference + catalog + operational + remaining)
node scripts/migrate-all-portal-data-from-supabase.cjs

# Historical POS bills (optional, last N days)
SALES_DAYS=90 node scripts/migrate-pos-sales-from-supabase.cjs
```

Imports: warehouses, catalog, recipes, scanners, `pos_item_map`, `warehouse_live_items` (via RPC), operators, logs, auth accounts.

**Does not import:** Orders App collections, transfer order signatures, `stock_ledger`.

---

## Phase 2 — Portal code (no Supabase calls)

1. Wire remaining APIs to Firestore (`recipe-*`, `scanners`, `pos-item-map`, `sync-pos-catalog`, `ingredient-catalog`, `item-storage-homes`, `operators`).
2. Fix dual-backend gaps: `/api/stock`, `outlets` PUT, `catalog/update-dispatch`.
3. Remove Supabase-only code paths once verified.
4. Drop `@supabase/supabase-js` from portal `package.json`.

---

## Phase 3 — POS middleware cutover (pilot outlets)

1. Switch Till 1, Till 2, Quick Corner PCs: `Cloud:Backend=Firebase` in `appsettings.json`.
2. Verify bill counts match MintPOS for 1–2 weeks per outlet (`CHECK SYNC/`).

---

## Phase 4 — Decommission Supabase

Checklist before deleting the Supabase project:

- [ ] All **pilot** till PCs (Till 1, 2, Quick Corner) on `Cloud:Backend=Firebase`
- [ ] Portal `.env` has no Supabase vars required at runtime
- [ ] Historical sales visible in portal reports from Firestore
- [ ] Catalog push → till sell → sync works end-to-end
- [ ] No statement timeouts / missing shifts for 30 days
- [ ] Orders App still works (will use Firebase directly — separate track)

Then: archive `supabase/` SQL, remove Supabase npm package, cancel Supabase subscription.

---

## Orders App (later)

The Orders App already targets Firebase (`app_users`, `outlet_order_catalog`, Cloud Functions). It does **not** block portal/POS cutover. Migrate and test it after Supabase deletion is safe for portal + middleware.
