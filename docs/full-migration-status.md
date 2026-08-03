# Full migration status — Afterten → Firestore

Last updated: 2026-08-02

**Scope:** Portal backoffice, POS middleware (SCPGT), and Expo Orders app on Firebase only — then delete Supabase.

**Out of scope (brother's systems):** Stock periods, inventory deduction, stocktake app, brother's stock API quantity logic.

---

## Summary

| Phase | Status |
|-------|--------|
| 0 — Foundation (code + Firebase project) | **Complete** |
| 1 — Orders app end-to-end (incl. PDF/signatures) | **Complete** ✅ |
| 2 — POS middleware (Till 1, 2, QC) | **In progress** |
| 3 — Production portal on Firebase | **Remaining** |
| 4 — 3-day pilot verification | **Not started** |
| 5 — Delete Supabase | **Not started** |
| 6 — Remove Supabase code from repo | **Not started** |

---

## Track A — POS middleware (pilot outlets)

| Item | Status |
|------|--------|
| SCPGT Firebase client + templates | Done |
| Catalog / cashier / heartbeat sync on Firebase | Done |
| Till 1 sales backfill | **Remaining** (`CHECK SYNC/`) |
| Till 2 on Firebase SCPGT | **Remaining** |
| Quick Corner on Firebase SCPGT | **Remaining** |

---

## Track B — Portal

| Item | Status |
|------|--------|
| Firebase API branches (catalog, sales, outlets, orders, middleware, recipes) | Done (code) |
| Stock catalog sync + delete-missing from brother's API | Done |
| Local dev on `CLOUD_BACKEND=firebase` | Done |
| Production `aftertentransfers.app` on Firebase | **Remaining** |
| Warehouse auth on production | **Remaining** |
| Remove Supabase runtime dependency | After Phase 5 |

---

## Track C — Orders app (Expo)

| Item | Status |
|------|--------|
| Firebase Auth + Firestore transfer orders | Done |
| Cloud Functions (place/complete/accept/dispatch/signatures) | Done |
| Supervisor flow + signatures + PDF | Done (verified Phase 1) |
| Retire Kotlin `Afterten Orders/` | After cutover |
| Historical Supabase order migration | Optional — no script yet |

---

## Next up (recommended order)

1. **Phase 2** — Finish Till 1 backfill, then Till 2 + Quick Corner on Firebase SCPGT
2. **Phase 3** — Production portal Firebase env + auth on Vercel
3. **Phase 4** — 3 consecutive green days on all three pilot outlets
4. **Phase 5–6** — Delete Supabase, strip Supabase code from repo

---

## “100% migrated” definition

1. Till 1, Till 2, Quick Corner on Firebase SCPGT — zero pending sales
2. Production portal on Firebase only
3. Expo Orders app in production use (Phase 1 flow verified)
4. Supabase project deleted; no runtime Supabase in portal or SCPGT

Rolling SCPGT to additional outlets is **not** part of this checklist — separate step after migration.
