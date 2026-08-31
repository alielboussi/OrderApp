# SCPGT → Portal API (no Supabase keys on till)

SCPGT never sees the Supabase service role key. Each till holds a **per-outlet middleware token** in a separate credentials file (same idea as Firebase service account JSON).

## Architecture

```
Till (SCPGT)  --Bearer mw_...-->  Portal /api/middleware/supabase/*
                                         |
                                         v
                                   Supabase (service role, server-only)
```

## 1 — Apply DB migration

Run in Supabase SQL Editor:

`supabase/migrations/20260831100000_outlet_middleware_api_token.sql`

Adds `outlets.middleware_api_token`.

## 2 — Generate tokens (dev machine)

```powershell
cd C:\Projects\Afterten

# Production portal URL when deploying:
$env:MIDDLEWARE_PORTAL_BASE_URL = "https://your-portal.vercel.app"

node firebase/scripts/generate-middleware-tokens.cjs
```

Writes one file per outlet under `exports/middleware-credentials/`:

```json
{
  "base_url": "https://your-portal.vercel.app",
  "outlet_id": "648e949d-8648-4c43-80d4-f08feb7bdd04",
  "outlet_name": "Till 1",
  "middleware_token": "mw_..."
}
```

**Do not commit these files.**

## 3 — Till install

1. Build/publish SCPGT with `Cloud:Backend = Portal`
2. Copy credentials file to till:

   `C:\ProgramData\SCPGT\middleware-credentials.json`

3. `appsettings.json` (no secrets except POS SQL password):

```json
{
  "Cloud": { "Backend": "Portal" },
  "Portal": {
    "CredentialsPath": "C:\\ProgramData\\SCPGT\\middleware-credentials.json"
  },
  "Outlet": { "Id": "648e949d-8648-4c43-80d4-f08feb7bdd04" }
}
```

Template: `pos-sync-service/appsettings.till1.portal.template.json`

## 4 — Verify

- Portal running with `CLOUD_BACKEND=supabase` + service role in `.env.local` (server only)
- Start SCPGT on till → check `outlet_pos_heartbeats` in Supabase
- Process a test sale → `outlet_sales` / `orders` rows appear

## Security notes

- Middleware token is **outlet-scoped** — can only call whitelisted RPCs/reads for that outlet
- Rotate token: re-run `generate-middleware-tokens.cjs` for one outlet
- Lock down `C:\ProgramData\SCPGT\` NTFS permissions (Administrators + SCPGT service account)

## Local dev

```powershell
# Terminal 1
cd afterten-website-portal && npm run dev

# Generate token pointing at localhost
$env:MIDDLEWARE_PORTAL_BASE_URL = "http://localhost:3000"
node firebase/scripts/generate-middleware-tokens.cjs --outlet-id 648e949d-8648-4c43-80d4-f08feb7bdd04
```

Copy generated JSON to `C:\ProgramData\SCPGT\middleware-credentials.json` and run SCPGT with Portal backend.
