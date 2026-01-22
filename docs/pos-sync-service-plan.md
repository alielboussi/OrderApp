# POS → Supabase Sync Windows Service (Plan)

## Goal
A Windows Service executable (installed via `services.msc`) that reads the local POS SQL Server DB, converts sales into the Supabase Orders_App schema, calls Supabase RPCs, and marks POS rows as processed. Each outlet runs its own instance with outlet-specific SQL credentials in config.

## Architecture
- **Process**: .NET 8 Worker Service (recommended for Windows Service hosting). Runs a polling loop.
- **Config (per outlet)**: `appsettings.json` next to the exe, edited post-install.
  - `PosDb.connectionString`: SQL Server connection string for the outlet.
  - `Outlet.id`: UUID of the outlet in Supabase.
  - `Supabase.url`, `Supabase.serviceKey`: Supabase REST/RPC access.
  - `Sync.pollSeconds`: poll interval (e.g., 60s).
  - `Sync.batchSize`: max orders per poll.
  - `Sync.sourceSystem`: string used for idempotency (e.g., "pos" or outlet code).
  - `Logging.level`: Info by default.
- **Data flow** (per poll):
  1) Read POS rows with `uploadstatus` in (Pending, NULL) from sales header/lines; join customer/payment info; build an event payload with `source_event_id` (e.g., POS sale id + outlet code).
  2) Call Supabase RPC `validate_pos_order(payload jsonb)` to confirm mappings exist.
  3) Call Supabase RPC `sync_pos_order(payload jsonb)` which maps items using `pos_item_map`, resolves deduction warehouse via `outlet_item_routes` (unless overridden), and deducts stock.
  4) On success, mark POS rows processed (set `uploadstatus = 'Processed'` or store last synced id).
  5) On failure, log and retry with backoff; keep a dead-letter queue table/file.
- **Idempotency**: Supabase side enforces unique `source_event_id` per order (unique index) so retries don’t duplicate.
- **Stock**: Service sends item/variant quantities; RPC uses existing `record_outlet_sale` to hit `stock_ledger` and `warehouse_layer_stock` view.

## Supabase-side requirements (current)
- RPCs: `validate_pos_order(payload jsonb)` and `sync_pos_order(payload jsonb)`.
- Constraint: unique index on `orders.source_event_id` (nullable) to prevent duplicates.
- Table: `pos_item_map` (required) to map POS items/flavours to catalog item + variant key + optional warehouse override.

## Windows Service packaging
- Build the Worker Service into a self-contained exe (win-x64) or framework-dependent if .NET 8 runtime is installed.
- Include `appsettings.json` and sample `appsettings.Development.json` with placeholders.
- Service name example: `PosSupabaseSync`.

### Install (per outlet)
1) Ensure .NET 8 Desktop Runtime is installed.
2) Copy the published folder (contains `PosSyncService.exe` and `appsettings.json`) to `C:\Program Files\PosSyncService`.
3) Edit `appsettings.json` with outlet’s SQL credentials, outlet UUID, Supabase URL/key.
4) Register service (PowerShell as admin):
   ```powershell
   New-Service -Name "PosSupabaseSync" -BinaryPathName "\"C:\\Program Files\\PosSyncService\\PosSyncService.exe\" --run-as-service" -DisplayName "POS → Supabase Sync" -Description "Sync POS sales to Supabase" -StartupType Automatic
   Start-Service -Name "PosSupabaseSync"
   ```
   (You can also use `sc create` or an installer like WiX/NSIS; above is the minimal built-in method.)

### Uninstall
```powershell
Stop-Service -Name "PosSupabaseSync"
sc delete PosSupabaseSync
```

## Sample appsettings.json
```json
{
  "PosDb": {
    "connectionString": "Server=localhost;Database=POS;User Id=POSUSER;Password=***;TrustServerCertificate=True"
  },
  "Outlet": {
    "id": "00000000-0000-0000-0000-000000000000"
  },
  "Supabase": {
    "url": "https://YOUR-PROJECT.supabase.co",
    "serviceKey": "SUPABASE_SERVICE_ROLE_KEY"
  },
  "Sync": {
    "pollSeconds": 60,
    "batchSize": 50,
    "sourceSystem": "afterten-pos"
  },
  "Logging": {
    "level": "Information"
  }
}
```

## Minimal ETL logic (pseudo)
- Query POS:
  - headers: `BillType` (or sales header table) where `uploadStatus` in (NULL,'Pending')
  - lines: join to `Saledetails` equivalent; include item id, qty, price, discount, tax
  - customer: `Customers`
  - payments: derive cash/card from `BillType` or payment tables
- Build `source_event_id = concat(outlet_code, '-', bill_id)`
- POST to Supabase RPC `sync_pos_order` with payload
- If 200, mark bill + lines `uploadStatus = 'Processed'`
- If non-200, log and retry later

## Next actions
- I can scaffold the .NET Worker Service project with the config layout above and a stub polling loop + Supabase client, ready to publish as a Windows Service.
- I can draft the Supabase RPC and `orders.source_event_id` unique index to make ingestion idempotent.
- Pick one or both and confirm the POS sale header/line table names you want to use.
