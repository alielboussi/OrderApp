# Migration status — Firebase only

Last updated: 2026-08-03

## Codebase

| Component | Backend | Status |
|-----------|---------|--------|
| Website portal (`afterten-website-portal/`) | Firebase / Firestore | **Active** — no Supabase code |
| SCPGT (`pos-sync-service/`) | Firebase / Firestore | **Active** — no Supabase code |
| Orders app (`afterten-orders-expo/`) | Firebase / Firestore | **Active** — Expo replacement for Kotlin app |
| Kotlin Android apps | — | **Removed** (were Supabase-only) |

## Remaining manual steps

1. Vercel: Root Directory = `afterten-website-portal`, Firebase env vars only (no `SUPABASE_*`)
2. Pilot outlets: Till 1, Till 2, Quick Corner — SCPGT `pending_bills = 0`
3. Delete Supabase cloud project when stable on Firebase
4. Rotate any credentials that were ever committed to `gradle.properties` (legacy Android config)
