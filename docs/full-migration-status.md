# Migration status — Firebase only

Last updated: 2026-08-03

The **Website Portal** (`afterten-website-portal/`), **SCPGT** (`pos-sync-service/`), and **Firebase** (`firebase/`) stacks are Firebase/Firestore-only in this repo. Supabase schema, clients, dual-backend switches, and migration scripts have been removed.

## Still outside this cleanup

| Area | Notes |
|------|--------|
| **Kotlin Orders / Stocktake apps** (`Afterten Orders/`, `Shared/`) | Still reference Supabase in Gradle and Kotlin sources — use **`afterten-orders-expo/`** for Firebase orders |
| **Supabase cloud project** | Delete manually in Supabase dashboard when pilot verification is complete |
| **Brother's stock API** | Separate system; portal syncs catalog via stock API, not Supabase |

## Production checklist

1. Vercel Root Directory: `afterten-website-portal`
2. Firebase env vars set (no `SUPABASE_*` or `CLOUD_BACKEND`)
3. Till 1 / Till 2 / Quick Corner SCPGT on Firebase with `pending_bills = 0`
4. Smoke-test `aftertentransfers.app` login + sales APIs
