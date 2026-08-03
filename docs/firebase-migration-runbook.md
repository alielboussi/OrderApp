# Firebase migration runbook

Execute in order. Check off each gate before moving to the next wave.

## Wave 0 — Foundation

- [x] Firebase project `afterten-portal-system` live
- [x] SCPGT `FirebaseCloudClient` + Till 1/2/QC templates
- [x] Expo Orders app on Firebase Auth + Firestore
- [x] Deploy rules, indexes, functions
- [x] Portal `.env.local` on **Afterten Website Portal** (`CLOUD_BACKEND=firebase`, credentials, client vars)
- [x] Stock catalog sync + delete-missing from brother's API

## Wave 1 — Orders app (Phase 1) ✅

- [x] Outlet Catalog Access → Expo login → place order → portal Outlet Orders
- [x] Signatures + PDF with full order details (verified 2026-08-02)

## Wave 2 — Till 1 POS complete

- [ ] `CHECK SYNC/` shows `pending_bills = 0` and Firestore count = MintPOS exportable
- [ ] SCPGT on Till 1 PC uses `appsettings.till1.firebase.template.json`
- [ ] Reports Hub outlet sales detail matches MintPOS for sample dates

## Wave 2 — Till 2 + Quick Corner

- [ ] Copy `appsettings.till2.firebase.template.json` → Till 2 PC `C:\ProgramData\SCPGT\appsettings.json`
- [ ] Copy `appsettings.quickcorner.firebase.template.json` → QC PC
- [ ] Run `node firebase/scripts/seed-outlets.cjs` (outlet metadata)
- [ ] Parallel compare bill counts vs Supabase for 2 weeks
- [ ] Use `CHECK SYNC/` on each till

## Wave 3 — Portal APIs (Supabase → Firestore)

Code paths implemented (activate with `CLOUD_BACKEND=firebase`):

1. ~~Catalog CRUD (`items`, `variants`, `menu-groups`)~~ — **done**
2. ~~`pos-sales`, dashboard stats~~ — **done**
3. ~~Outlet transfer orders APIs~~ — **done**
4. Stock / warehouses / recipes — **done** (Firebase branches exist; verify on prod)

**Remaining:** Production Vercel env + end-to-end prod smoke test (Phase 3).

## Wave 4 — Orders app production

- [x] Expo login + place order
- [x] Supervisor accept/dispatch + signatures + PDF (Phase 1 verified)
- [ ] Retire Kotlin `Afterten Orders/`
- [ ] (Optional) Migrate historical Supabase `orders` → `transfer_orders`

## Wave 5 — Supabase decommission

- [ ] 3 green days on Till 1, Till 2, Quick Corner
- [ ] Delete Supabase project
- [ ] Remove Supabase code from portal + SCPGT

## Orders app login (Till 1)

```powershell
cd C:\Projects\Afterten\firebase
node scripts/seed-orders-app.cjs
```

Default credentials: `oneway@gmail.com` / `oneway`

## Import Supabase catalog into Firestore (one-time)

After catalog CRUD APIs are on Firebase, copy existing Supabase rows:

```powershell
cd C:\Projects\Afterten\firebase
# Ensure Afterten Website Portal/.env.local has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
node scripts/migrate-catalog-from-supabase.cjs
```

Dry run (counts only):

```powershell
$env:DRY_RUN="1"; node scripts/migrate-catalog-from-supabase.cjs
```
