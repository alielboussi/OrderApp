# Quick Corner + sales API → Firestore cutover

Outlet UUID: `a406fede-7aab-4473-8e9f-ff645267466f`

## Order of operations

### 1. Stop SCPGT on Quick Corner PC
```powershell
Stop-Service SCPGT
```

### 2. Migrate Supabase sales → Firestore (dev machine)
```powershell
cd C:\Projects\Afterten\firebase
node scripts/migrate-pos-sales-from-supabase.cjs
```
Uses `OUTLET_ID=a406fede-7aab-4473-8e9f-ff645267466f` by default when set in env, or:
```powershell
$env:OUTLET_ID="a406fede-7aab-4473-8e9f-ff645267466f"
node scripts/migrate-pos-sales-from-supabase.cjs
```

Verify:
```powershell
node "C:\Projects\Afterten\CHECK SYNC\firestore-count.cjs" a406fede-7aab-4473-8e9f-ff645267466f
```

### 3. Shift portal sales APIs to Firestore (Vercel / production)

Set on **aftertentransfers.app**:
```
CLOUD_BACKEND=firebase
NEXT_PUBLIC_CLOUD_BACKEND=firebase
FIREBASE_PROJECT_ID=afterten-portal-system
FIREBASE_SERVICE_ACCOUNT_JSON={...}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=afterten-portal-system
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=afterten-portal-system.firebaseapp.com
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

No route code changes — these APIs already branch on `CLOUD_BACKEND`:
- `/api/outlet-middleware-sales/tills` (Till 1 + Till 2)
- `/api/outlet-middleware-sales/quick-corner`

Till 1 and Till 2 data is already in Firestore from SCPGT sync.

### 4. Deploy SCPGT to Quick Corner
- Copy `pos-sync-service\publish\SCPGT.exe`
- Copy `appsettings.quickcorner.json` → `C:\ProgramData\SCPGT\appsettings.json`

### 5. Continue from pending (do NOT reset all sales)

**Do not run** `mintpos-reset-sales-to-pending.sql` on Quick Corner.

Just start SCPGT — it uploads only **Pending** bills. Bills already **Processed** in MintPOS that exist in Firestore (from step 2) reconcile automatically.

Monitor:
```sql
-- CHECK SYNC/quickcorner-mintpos-sync-status.sql
```

```powershell
node "C:\Projects\Afterten\CHECK SYNC\firestore-count.cjs" a406fede-7aab-4473-8e9f-ff645267466f
```

**SYNC COMPLETE** when MintPOS `pending_bills = 0` and Firestore count = `exportable_bills_with_lines`.

### 6. Start SCPGT
```powershell
Start-Service SCPGT
```
