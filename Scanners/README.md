## Scanners (Warehouse Backoffice)

Next.js app for the AfterTen warehouse backoffice, outlet management, and supporting API routes. Deploy from the `Scanners/` directory.

Legacy per-storeroom transfer scanner UIs (Beverages, Coldrooms, Ingredients, etc.) have been removed. Hub inventory is handled through **Warehouse Backoffice → Purchases / Transfers / Damages**. Outlet workflows use the **Afterten Orders** Android app.

### Prerequisites

- Supabase project with warehouse, catalog, outlet, and stock ledger schema applied.
- Vercel account (or any Next.js-compatible host).

### Local setup

```bash
cp Scanners/.env.example Scanners/.env.local
cd Scanners
npm install
npm run dev
```

Fill `.env.local` with your Supabase credentials before running `npm run dev`.

### Environment variables

| Name | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL exposed to the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for backoffice auth + client queries. |
| `SUPABASE_URL` | (Optional) Server-side Supabase URL; defaults to `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key used in API routes. Keep secret. |
| `STOCK_VIEW_NAME` | Optional warehouse stock view override. Defaults to `warehouse_stock_current`. |

### Deploying to Vercel

1. Configure environment variables in the Vercel project settings.
2. Connect the repo and deploy. Primary URLs:
   - `https://<vercel-domain>/` → landing page
   - `https://<vercel-domain>/Warehouse_Backoffice` → warehouse backoffice dashboard
   - `https://<vercel-domain>/api/warehouses` → warehouse list API
   - `https://<vercel-domain>/api/stock` → stock aggregation API

### Architecture

- `src/app/Warehouse_Backoffice/` – Backoffice UI (catalog, purchases, outlets, stocktakes, live balances).
- `src/app/api/` – Server routes for warehouses, stock, transfers, catalog, outlets, POS deductions, etc.
- `src/lib/outletScope.ts` / `src/lib/sellingOutlets.ts` – Shared outlet filtering for backoffice pages.
