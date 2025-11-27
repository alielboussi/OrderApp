## Stock View Page

Single-page Next.js dashboard that prompts the user to pick a warehouse, enter an optional search term, and then displays the live stock (including descendant warehouses) by reading from Supabase Edge Functions. The site is now fully static, so it can be hosted directly from Supabase Web Hosting or any static CDN.

### Prerequisites

- Supabase project with the `warehouse_stock_current` view (or any equivalent materialized view) available.
- Supabase CLI (`npm install -g supabase`) so you can deploy edge functions and static assets.
- Two Supabase Edge Functions (`stock` and `warehouses`) that live in `supabase/functions/*` inside this repo.

### Local setup

```bash
cp .env.example .env.local   # set NEXT_PUBLIC_SUPABASE_FUNCTION_URL
npm install
npm run dev
```

The `.env.local` file should point to your project’s function gateway, e.g. `https://abc123.supabase.co/functions/v1`. Local development proxies every fetch directly to the deployed edge functions.

### Environment variables

| Name | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_FUNCTION_URL` | Public base URL for Supabase Edge Functions (no trailing slash). |

Edge Functions themselves need the usual server-side secrets; push them with:

```bash
supabase functions secrets set SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  WAREHOUSE_STOCK_VIEW=warehouse_stock_current
```

### Deploying to Supabase Hosting

1. **Link the project**
	```bash
	supabase init                # only once per repository
	supabase link --project-ref <your-project-ref>
	```
2. **Deploy the edge functions**
	```bash
	supabase functions deploy warehouses --no-verify-jwt
	supabase functions deploy stock --no-verify-jwt
	```
3. **Build the static site**
	```bash
	cd stock-view-page
	npm run build                # emits ./out because next.config.ts -> output: 'export'
	```
4. **Upload the static assets**
	```bash
	supabase web deploy ./stock-view-page/out
	```
	The command prints the production URL (e.g. `https://abc123.supabase.co`). Share that link with stakeholders.

Whenever the client code changes, repeat steps 3–4. Whenever the data logic changes, redeploy the relevant edge function.

### Architecture

- `supabase/functions/warehouses` – returns the active warehouse tree used to populate the selector.
- `supabase/functions/stock` – accepts `{ warehouseId, search }`, gathers descendants, queries `warehouse_stock_current`, and responds with raw rows plus aggregates.
- `src/app/page.tsx` – purely client-side React component that calls the two functions via `NEXT_PUBLIC_SUPABASE_FUNCTION_URL`. Because everything runs client-side, the service-role key never touches the browser; only the Edge Functions read it server-side.

The project purposely avoids internal Next.js API routes so that static exports remain possible.
