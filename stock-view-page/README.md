## Stock View Page

Single-page Next.js dashboard that prompts the user to pick a warehouse, enter an optional search term, and then displays the live stock (including descendant warehouses) by reading from Supabase.

### Prerequisites

- Supabase project with the `warehouse_stock_current` view exposed through PostgREST.
- Service Role key (used server-side in the Vercel/Next.js API routes).

### Local setup

```bash
cp .env.example .env.local   # fill in Supabase values
npm install
npm run dev
```

Open http://localhost:3000 on iOS/Android/desktop. The UI is touch friendly and prevents navigation to other routes via middleware.

### Environment variables

| Name | Description |
| --- | --- |
| `SUPABASE_URL` | Base URL of the Supabase project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key with RLS bypass for server-side aggregation. |
| `WAREHOUSE_STOCK_VIEW` (optional) | Override if the view name differs between environments. Defaults to `warehouse_stock_current`. |

### Deploying on Vercel

1. Push this folder with the rest of the mono-repo.
2. In Vercel, import the repository and set the project root to `stock-view-page`.
3. Add the environment variables above (Production + Preview).
4. Deploy. Because of the middleware, attempts to browse to `/anything-else` always redirect back to `/`.

### API surface

- `GET /api/warehouses` – returns active warehouses for the selector.
- `POST /api/stock` – accepts `{ warehouseId, search }`, gathers descendants, queries `warehouse_stock_current`, and responds with both the raw rows and aggregated totals used by the UI.

Both routes run entirely on the server and never expose the service role key to the browser.
