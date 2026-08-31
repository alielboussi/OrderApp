# Firestore decommission plan

Goal: run the entire stack on **Supabase + portal APIs** so the Firebase/Firestore project can be deleted.

`CLOUD_BACKEND=supabase` on Vercel switches implemented routes. Everything else still reads Firestore until migrated.

## Already on Supabase (no Firestore)

| Area | Status |
|------|--------|
| Postgres schema | `supabase/migrations/` |
| Brother + MintPOS catalog import | `firebase/scripts/*-supabase.cjs` |
| SCPGT middleware (Portal backend) | `PortalCloudClient` → `/api/middleware/supabase/*` |
| Middleware outlet tokens | `outlets.middleware_api_token` |
| Portal: outlets / warehouses / outlet-warehouses GET | `*-store.ts` facades |
| Portal: middleware status | `middleware-status-store.ts` |

## Phase 1 — Portal reads (backoffice can browse Supabase data)

Migrate `firestore-*` modules → `supabase-*` + `*-store.ts` facades. **~65 API routes** remain.

| Priority | Domain | `firestore-*` module | Supabase tables |
|----------|--------|----------------------|-----------------|
| 1 | Sales / POS | `firestore-pos-sales`, `outlet-middleware-sales-firebase` | `outlet_sales`, `orders` |
| 2 | Catalog | `firestore-catalog-items`, `variants`, `menu-groups`, `uoms` | `catalog_*` |
| 3 | Catalog sync | `firestore-catalog-sync`, `outlet-push`, `pos-catalog-ids` | `outlet_catalog_sync_events` |
| 4 | Transfer orders | `firestore-transfer-orders` | `orders`, `order_items` |
| 5 | Damages | `firestore-damage-reports` | (add table or use orders pattern) |
| 6 | Cashiers | `firestore-cashiers` | `outlet_cashiers` |
| 7 | Recipes / stock | `firestore-recipes`, `warehouse-stock` | `catalog_items`, warehouses |
| 8 | Ops | logs, traces, scanners, suppliers, operators | matching tables |

**Pattern for each domain:**

1. Add `supabase-<domain>.ts` (queries via `getSupabaseAdmin()`).
2. Add `<domain>-store.ts` with `isSupabaseBackend()` branch.
3. Update API routes to import from `*-store.ts`, use `cloudBackendMeta()`.
4. Test with `CLOUD_BACKEND=supabase` locally.

## Phase 2 — Portal writes + Storage

| Item | Today | Target |
|------|-------|--------|
| Catalog image upload | Firebase Storage | Supabase Storage bucket |
| Order/damage signatures & photos | Firebase Storage | Supabase Storage |
| Outlet create (orders app) | Firebase Auth + Firestore | Supabase Auth or service accounts |
| Warehouse backoffice login | Firebase Auth client | Supabase Auth **or** keep Firebase Auth temporarily |

Warehouse login is the hardest cut — every `requireWarehouseAuth` route depends on Firebase ID tokens today.

## Phase 3 — Orders app (Expo, local repo)

Replace **20 Cloud Functions** callables with portal REST/RPC:

- `placeTransferOrder`, `acceptTransferOrder`, `dispatchTransferOrder`, `completeTransferOrder`
- Damage report lifecycle
- Push tokens / preparation checklist
- `listOutletOrderCatalog`, `getStockControlSnapshot`

Until the Expo app is repointed, **Firestore Functions must stay deployed**.

## Phase 4 — SCPGT on all tills

| Till | Action |
|------|--------|
| Till 1 | In progress — Portal backend live |
| Till 2 | Copy exe + credentials + requeue SQL |
| Quick Corner | Same |

Set `Cloud:Backend=Portal` everywhere. Remove `FirebaseCloudClient` path when all tills migrated.

## Phase 5 — Delete Firebase

Only when **all** are true:

- [ ] `CLOUD_BACKEND=supabase` on production, all portal routes migrated
- [ ] Orders app uses portal APIs (no `httpsCallable`)
- [ ] All tills on SCPGT Portal backend
- [ ] No production reads of Firestore for 2+ weeks
- [ ] Catalog images + signatures on Supabase Storage
- [ ] Warehouse auth decided (Supabase Auth or acceptable interim)

Then:

1. Remove `firebase`, `firebase-admin` from `package.json`
2. Delete `firebase/functions` deploy
3. Delete Firestore project in Google Cloud Console
4. Remove Firebase env vars from Vercel

## Env vars after cutover

**Keep:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Stock API vars, `OUTLET_ORDERS_API_BEARER_KEY`

**Remove:** `FIREBASE_*`, `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_JSON`

## Next coding sessions (suggested order)

1. **Sales APIs** — `/api/outlet-sales`, `/api/pos-sales`, `/api/outlet-middleware-sales/*`
2. **Catalog CRUD** — `/api/catalog/*` (largest surface)
3. **Transfer orders** — `/api/outlet-orders/*`
4. **Warehouse auth** — design decision, then migrate `warehouse-api-auth.ts`
5. **Cloud Functions** — port to portal routes or Supabase RPCs; update Expo app
