# MintPOS catalog → Supabase (without Node on the till)

You only need **one small file** on the till PC. Everything else runs on your dev machine.

## Step 1 — On the till PC (2 minutes)

1. Copy this single file to the till (USB, RDP, Teams, etc.):
   - `pos-sync-service/scripts/Export-MintPosCatalog.ps1`
2. Right-click it → **Run with PowerShell**  
   (Or open PowerShell and run: `powershell -ExecutionPolicy Bypass -File .\Export-MintPosCatalog.ps1`)
3. It reads `C:\ProgramData\SCPGT\appsettings.json` (already there from SCPGT) and writes:
   - **`Desktop\mintpos-catalog-export.json`**

No project folder. No Node. No npm.

## Step 2 — Back on your dev PC

1. Copy `mintpos-catalog-export.json` from the till Desktop to this repo, e.g.:
   - `exports/mintpos/catalog.json`
2. Import into Supabase:

```powershell
cd C:\Projects\Afterten
node firebase/scripts/mintpos-catalog-import-supabase.cjs --from-json exports/mintpos/catalog.json
```

3. Verify:

```powershell
node firebase/scripts/inspect-supabase.cjs
```

You should see finished `catalog_items`, `catalog_variants`, and `catalog_menu_groups` (not just ingredients).

---

## Alternative — SSMS only (no PowerShell)

1. On the till, open **SSMS** → connect to `MINTPOS`
2. Run queries in `pos-sync-service/scripts/export-mintpos-catalog-for-import.sql`
3. Save results as CSV or use **Results to File**
4. Convert to the JSON shape expected by the import script, or ask for help converting the export

The PowerShell script is easier because it produces the correct JSON automatically.

---

## Optional — partial import now (no till visit)

Firestore still has a **small** portal copy (24 finished products). On your dev PC only:

```powershell
node firebase/scripts/firestore-finished-catalog-import-supabase.cjs
```

This is **not** the full till catalog — use the till export above when you can.

---

## Later — zero manual exports

When SCPGT is pointed at Supabase, we can make the middleware push catalog on its normal sync cycle so you never export by hand again. That’s a follow-up after this one-time bootstrap.
