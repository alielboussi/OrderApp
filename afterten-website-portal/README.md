## Afterten Website Portal (Warehouse Backoffice)

Next.js app for the AfterTen warehouse backoffice, outlet management, and supporting API routes.

**Vercel:** set the project **Root Directory** to **`afterten-website-portal`**.

Outlet transfer orders use the **Expo orders app** (`afterten-orders-expo/`). Legacy Kotlin Android apps have been removed.

### Prerequisites

- Firebase project `afterten-portal-system` with Firestore data and Firebase Auth enabled.
- Vercel account (or any Next.js-compatible host).

### Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Fill `.env.local` with Firebase credentials (see `.env.example`).

### Deploying to Vercel

1. **Root Directory:** `afterten-website-portal`
2. Set Firebase env vars from `.env.example` (no Supabase variables).
3. Deploy. Primary URLs:
   - `https://<vercel-domain>/Warehouse_Backoffice` — backoffice dashboard
   - `https://<vercel-domain>/api/outlet-middleware-sales/tills` — middleware sales API

### Architecture

- `src/app/Warehouse_Backoffice/` — Backoffice UI
- `src/app/api/` — Server routes (Firestore-backed)
- `src/lib/firestore-*.ts` — Firestore data access
