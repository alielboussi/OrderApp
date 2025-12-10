## Scanners (Warehouse Consoles)

Consolidated Next.js app that serves both the Main Warehouse and Beverages Storeroom transfer portals, plus the supporting API routes. Everything now lives under the `Scanners/` directory so a single deployment can expose the landing page and both scanner paths.

### Prerequisites

- Supabase project with the `warehouse_stock_current` view (or equivalent) plus the `transfer_units_between_warehouses` RPC, `warehouses`, `catalog_items`, and `catalog_variants` tables.
- Vercel account (or any Next.js-compatible host) for deploying `Scanners`.
- Supabase service-role key so the Vercel API routes can read warehouse/product data.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL exposed to the browser (used by the transfer portal). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key used by the portal for user authentication + RPC calls. |
| `SUPABASE_URL` | (Optional) Explicit server-side Supabase URL; defaults to `NEXT_PUBLIC_SUPABASE_URL` when omitted. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key used **only** inside Next.js API routes to fetch warehouses, stock, and products. Keep this secret. |
| `STOCK_VIEW_NAME` | Optional override of the warehouse stock view name. Defaults to `warehouse_stock_current`. |
| `TWILIO_ACCOUNT_SID` | Twilio Project SID used for the WhatsApp API (sandbox or production sender). |
| `TWILIO_AUTH_TOKEN` | Twilio auth token; rotate it if it ever leaks. |
| `TWILIO_WHATSAPP_NUMBER` | WhatsApp-enabled Twilio sender (sandbox number or approved business number). Use the bare E.164 number without the `whatsapp:` prefix. |
| `WHATSAPP_TEMPLATE_SID` | Twilio Content Template SID (e.g., `HX8f3e...`) for the approved `warehouse_out_transfers` template. |
| `WHATSAPP_TO_NUMBER` | Comma separated list of recipient numbers (E.164) that should receive every transfer alert. |

### WhatsApp notifications (Twilio)

- For quick tests, use the Twilio WhatsApp Sandbox. Every recipient must text `join <code>` to the sandbox number and Twilio automatically removes them after roughly 72 hours of inactivity. That re-opt-in cycle is a sandbox limitation and cannot be disabled.
- To avoid rejoining, request a production WhatsApp sender inside Twilio Console → **Messaging → Senders → WhatsApp Senders** and complete the Meta Business verification + template approval.
- Once the sender is approved, update `TWILIO_WHATSAPP_NUMBER` with the new number and keep the recipient list in `WHATSAPP_TO_NUMBER` (or store the list in Supabase if you need per-user preferences).

### Deploying to Vercel

1. **Configure environment variables** in the Vercel project settings (same names as above). Commit `.env.example` updates to help future teammates.
2. **Push the repo to GitHub** (or keep using `alielboussi/OrderApp`). Connect the Vercel project to that repo.
3. **Trigger a deployment** – every push to the default branch will build the Next.js app. The resulting URLs are:
   - `https://<vercel-domain>/` → blank landing screen ("Inventory Management System") with shared theme.
   - `https://<vercel-domain>/Main_Warehouse_Scanner` → Main warehouse transfer console.
   - `https://<vercel-domain>/Beverages_Storeroom_Scanner` → Beverages storeroom transfer console.
   - `https://<vercel-domain>/api/warehouses` → JSON warehouse list.
   - `https://<vercel-domain>/api/stock` → JSON stock aggregation endpoint.
   - `https://<vercel-domain>/api/warehouse-transfers` → JSON feed of recent transfers.

### Architecture

- `src/app/api/warehouses/route.ts` – Vercel API route replacing the former Supabase `warehouses` function.
- `src/app/api/stock/route.ts` – Aggregates descendant warehouse stock, mirroring the old `stock` function logic.
- `src/app/Main_Warehouse_Scanner/route.ts` – Serves the HTML/JS portal that talks to Supabase directly with the anon key (main warehouse route).
- `src/app/Beverages_Storeroom_Scanner/route.ts` – Same portal hard-locked to the beverages storeroom IDs.
- `src/app/api/notify-whatsapp/route.ts` – Pushes transfer summaries to the approved Twilio WhatsApp template once a move is recorded.
- `src/app/page.tsx` – Minimal landing view that shares the scanner theme and simply labels the Inventory Management System.

Updating data logic now happens inside the Vercel API routes; deploy via Vercel to release both UI and API changes simultaneously.
