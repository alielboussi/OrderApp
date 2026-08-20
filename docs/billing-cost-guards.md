# Billing cost guards (Afterten)

This document exists so we never again recreate the August 2026 Firestore spike (~$20–25/day).

## Root cause (do not repeat)

- Cloud Function: `syncStockCatalogScheduled`
- Region: `europe-west1`
- Trigger: Cloud Scheduler (~every 1 minute)
- Work: full scans of `catalog_items` + `catalog_variants` (+ related writes)
- Result: large Firestore **Read Ops** + **Internet egress**

## Permanent rules

1. **Never** add `onSchedule` / Cloud Scheduler for stock catalog sync.
2. **Never** poll full catalog collections on a timer in Cloud Functions.
3. Catalog sync is **manual only**, and **locked off in code** (`STOCK_CATALOG_SYNC_ENABLED = false`).
4. Unlocking requires a **code change** (env alone cannot re-enable portal sync).
5. After any one-off unlock: run sync once → set false → redeploy.

## Verified safe (as of last audit)

| Check | Expected |
|-------|----------|
| Cloud Scheduler (all regions) | **0 jobs** |
| `syncStockCatalogScheduled` | **Deleted / not present** |
| Firebase Functions | Callables only in `africa-south1` |
| `STOCK_CATALOG_SYNC_ENABLED` (functions + portal) | `false` hardcoded |

Re-audit anytime:

```powershell
cd C:\Projects\Afterten\firebase
node scripts\audit-sync-infrastructure.mjs
firebase functions:list --project afterten-portal-system
```

## Other cost-sensitive paths (mitigated)

| Path | Risk | Mitigation |
|------|------|------------|
| Portal Stock API sync POST | Full catalog scan | Locked behind hardcoded `false` + 403 |
| Callable `syncStockCatalog` | Accidental enable | **Not exported** from `index.ts` (removed on deploy) |
| Warehouse balances page | Full `catalog_variants` every 30s | 5 min refresh + 5 min server cache |
| Outlet orders page | Poll every 20s | Poll every **60s** |
| Middleware status panels | Poll every 60s | Poll every **120s** |
| Orders app stock control | Poll every 15s when enabled | Poll every **60s**; keep disabled unless needed |
| POS middleware | Poll ~60s sales | Normal ops; not full catalog sync |

## If costs spike again

1. Run `node firebase/scripts/audit-sync-infrastructure.mjs`
2. Check Billing → Reports → Firestore SKUs (Read Ops)
3. Pause any new Scheduler jobs immediately
4. Open billing support with screenshots
