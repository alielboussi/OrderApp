# Firebase migration phases

Living checklist. Work top-to-bottom.

**Done when:** Portal + pilot POS middleware (Till 1, 2, Quick Corner) + Expo Orders app run on Firebase only; Supabase project deleted.

**Out of scope:** Stock periods, inventory deduction, stocktake app — brother's systems.

---

## Phase 0 — Foundation

- [x] Firebase project `afterten-portal-system` live
- [x] Firestore rules, indexes, Cloud Functions deployed (transfer orders, stock catalog sync)
- [x] SCPGT `FirebaseCloudClient` + Till 1/2/QC `appsettings.*.firebase.template.json`
- [x] Portal local env on Firebase (`CLOUD_BACKEND=firebase`, credentials, client vars)
- [x] Portal APIs dual-backend — Firebase branches implemented for catalog, sales, outlets, middleware, outlet orders, recipes, stock, etc.
- [x] Stock catalog sync from brother's API + delete portal rows missing from API

---

## Phase 1 — Orders App: end-to-end smoke test ✅

Verified 2026-08-02:

- [x] Firebase Auth user → **Outlet Catalog Access** → save products
- [x] Expo login → place order
- [x] Portal **Outlet Orders** shows order + line items
- [x] Full signature flow + PDF with order details and all signatures

---

## Phase 2 — POS middleware (Till 1, 2, Quick Corner)

- [ ] Till 1 — sales backfill complete (`CHECK SYNC/`: `pending_bills = 0`, Firestore = MintPOS exportable)
- [ ] Till 1 — SCPGT PC confirmed on `Cloud:Backend=Firebase`
- [ ] Till 2 — SCPGT `Cloud.Backend=Firebase` + sales backfill
- [ ] Quick Corner — SCPGT `Cloud.Backend=Firebase` + sales backfill

**Gate:** All three pilot outlets upload sales, catalog, and cashiers to Firestore only.

---

## Phase 3 — Production portal on Firebase

- [ ] Deploy `aftertentransfers.app` with `CLOUD_BACKEND=firebase` + `FIREBASE_SERVICE_ACCOUNT_JSON` (or credentials) on Vercel
- [ ] Warehouse backoffice auth working on production
- [ ] Smoke-test production: catalog, reports, middleware sales, outlet orders

**Gate:** Production portal reads/writes Firestore only (no Supabase runtime).

**Note:** Code is ready locally; production env + auth still need verification.

---

## Phase 4 — 3-day verification (pilot outlets)

Run daily on Till 1, Till 2, Quick Corner for **3 consecutive green days**:

- [ ] Sales sync — no stuck bills; SCPGT `lastSyncError` null
- [ ] Portal sales API returns data for current dates
- [ ] Catalog price update → POS within sync cycle
- [ ] New product/variant push → POS
- [ ] New cashier in portal → MintPOS via middleware
- [ ] No recurring SCPGT or portal errors in logs

**Gate:** 3 days green → proceed to Supabase deletion.

---

## Phase 5 — Delete Supabase project

- [ ] Cancel Supabase subscription
- [ ] Delete Supabase project
- [ ] Archive `supabase/` SQL locally

---

## Phase 6 — Post-deletion code cleanup

- [ ] Remove `@supabase/supabase-js` from portal
- [ ] Remove Supabase branches from portal APIs
- [ ] Remove `/api/supabase-proxy`
- [ ] Default `CLOUD_BACKEND` to `firebase`
- [ ] Remove Supabase client from `pos-sync-service`
- [ ] Retire Kotlin `Afterten Orders/` (Expo is production app)

**Optional (not blocking cutover):**

- [ ] Migrate historical Supabase `orders` → Firestore `transfer_orders` (one-time script — not written yet)

---

## Reference

| Outlet | UUID |
|--------|------|
| Till 1 | `648e949d-8648-4c43-80d4-f08feb7bdd04` |
| Till 2 | `a655b0a1-a37a-43d6-aa55-7f97377b2660` |
| Quick Corner | `a406fede-7aab-4473-8e9f-ff645267466f` |

Firebase project: `afterten-portal-system`

Deploy: `cd firebase && firebase deploy --only firestore:rules,firestore:indexes,functions`
