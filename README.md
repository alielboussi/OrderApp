# Afterten

Monorepo for Afterten outlet operations.

## Active projects

| Path | Purpose |
|------|---------|
| [`afterten-website-portal/`](afterten-website-portal/) | Warehouse backoffice (Next.js + Firebase) — production on Vercel |
| [`pos-sync-service/`](pos-sync-service/) | SCPGT — MintPOS → Firestore sync middleware |
| [`firebase/`](firebase/) | Firestore rules, Cloud Functions, admin scripts |
| [`afterten-orders-expo/`](afterten-orders-expo/) | Outlet transfer orders app (Expo + Firebase) — local checkout, gitignored |

## Retired

The legacy **Kotlin Android** orders/stocktake/supervisor apps (`Afterten Orders/`, `Shared/`) targeted Supabase and have been removed. Use **afterten-orders-expo** for outlet orders.

## Quick start — portal

```bash
cd afterten-website-portal
cp .env.example .env.local   # fill Firebase credentials
npm install
npm run dev
```

Vercel root directory: **`afterten-website-portal`**.
