# SCPGT Middleware Deployment Guide

Deploy **one file only**: `SCPGT.exe`

## What the middleware does

- Syncs POS sales from local MintPOS SQL to Supabase
- POS catalog + menu group sync (automatic + dashboard on-demand)
- Catalog updates from website → MintPOS
- Windows Service `SCPGT` + hotkey UI listener

## Outlet install (EXE only)

1. Copy **`SCPGT.exe`** to the outlet PC (USB, RDP, anything — no other files).
2. Double-click **`SCPGT.exe`** → setup wizard opens (UAC elevation).
3. Choose **Install / Update service** → set folders → enter:
   - Outlet UUID (`public.outlets.id`)
   - Supabase URL + keys
   - POS SQL Server / database / user / password
4. Click **Finish** — service installs to `C:\Program Files\SCPGT\SCPGT.exe`
5. Config is written to **`C:\ProgramData\SCPGT\appsettings.json`** (created by wizard, not shipped with exe).
6. On **MintPOS SQL Server** (one-time, from HQ): run `unified.sql` + `backfill_mintpos_menu_groups.sql` (repo: `pos-sync-service/scripts/`).
7. Website dashboard → **Sync POS catalog now**
8. Test one POS sale

## Supabase (HQ / cloud — before outlet install)

Run in Supabase SQL Editor:

`supabase/scripts/verify_mintpos_catalog_setup.sql`

Summary must show **READY FOR OUTLET MIDDLEWARE INSTALL** (`fail_count = 0`).

## Build output

```powershell
cd pos-sync-service
dotnet publish -c Release
```

Produces **only** `publish\SCPGT.exe` (~77 MB self-contained).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Service stopped | `Start-Service SCPGT` |
| Wrong outlet/keys | Edit `C:\ProgramData\SCPGT\appsettings.json` → `Restart-Service SCPGT` |
| SQL permission errors | Re-run MintPOS grants (`unified.sql`) |
| No sales syncing | Confirm outlet `has_pos_middleware` + stocktake window open |

Sales export API (same JSON on both routes):

| Outlet | Route |
|--------|-------|
| Till 1, Till 2 | `https://<website>/api/outlet-middleware-sales/tills` |
| Quick Corner | `https://<website>/api/outlet-middleware-sales/quick-corner` |

Legacy (all outlets): `https://<website>/api/outlet-middleware-sales`
