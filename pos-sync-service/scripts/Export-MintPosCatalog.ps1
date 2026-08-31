# Export MintPOS catalog (no Node / no project folder needed)
#
# Copy ONLY this file to the till PC (USB, RDP paste, email attachment).
# Right-click → Run with PowerShell   OR open PowerShell and run:
#
#   powershell -ExecutionPolicy Bypass -File .\Export-MintPosCatalog.ps1
#
# Output: Desktop\mintpos-catalog-export.json
# Copy that file back to your dev PC, then:
#
#   node firebase/scripts/mintpos-catalog-import-supabase.cjs --from-json path\to\mintpos-catalog-export.json

param(
    [string]$AppsettingsPath = "C:\ProgramData\SCPGT\appsettings.json",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path $Path)) {
        throw "File not found: $Path"
    }
    return Get-Content -Path $Path -Raw | ConvertFrom-Json
}

function Get-PosConnectionString($Appsettings) {
    $pos = $Appsettings.PosDb
    if ($null -eq $pos) { throw "PosDb section missing in appsettings.json" }

    if ($pos.ConnectionString -and [string]::IsNullOrWhiteSpace($pos.ConnectionString) -eq $false) {
        return [string]$pos.ConnectionString
    }

    $server = [string]$pos.Server
    $database = if ($pos.Database) { [string]$pos.Database } else { "MINTPOS" }
    $username = [string]$pos.Username
    $password = [string]$pos.Password
    $trust = if ($null -ne $pos.TrustServerCertificate) { [bool]$pos.TrustServerCertificate } else { $true }
    $encrypt = if ($null -ne $pos.Encrypt) { [bool]$pos.Encrypt } else { $false }
    $integrated = if ($null -ne $pos.IntegratedSecurity) { [bool]$pos.IntegratedSecurity } else { $false }

    if ([string]::IsNullOrWhiteSpace($server)) {
        throw "PosDb.Server is empty in appsettings.json"
    }

    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder.DataSource = $server
    $builder.InitialCatalog = $database
    $builder.Encrypt = $encrypt
    $builder.TrustServerCertificate = $trust

    if ($integrated) {
        $builder.IntegratedSecurity = $true
    }
    else {
        if ([string]::IsNullOrWhiteSpace($username)) { throw "PosDb.Username is required" }
        $builder.UserID = $username
        $builder.Password = $password
    }

    return $builder.ConnectionString
}

function Invoke-SqlQuery([string]$ConnectionString, [string]$Sql) {
    $connection = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
    $connection.Open()
    try {
        $command = $connection.CreateCommand()
        $command.CommandText = $Sql
        $command.CommandTimeout = 120
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
        $table = New-Object System.Data.DataTable
        [void]$adapter.Fill($table)
        return $table
    }
    finally {
        $connection.Close()
    }
}

function Convert-DataTableToObjectArray($Table) {
    $rows = @()
    foreach ($row in $Table.Rows) {
        $obj = [ordered]@{}
        foreach ($col in $Table.Columns) {
            $value = $row[$col]
            if ($value -is [DBNull]) {
                $obj[$col.ColumnName] = $null
            }
            elseif ($value -is [decimal] -or $value -is [double] -or $value -is [float]) {
                $obj[$col.ColumnName] = [double]$value
            }
            else {
                $obj[$col.ColumnName] = [string]$value
            }
        }
        $rows += [pscustomobject]$obj
    }
    return $rows
}

$menuGroupsSql = @"
SELECT
    mg.Id AS pos_menu_group_id,
    LTRIM(RTRIM(mg.Name)) AS group_name
FROM dbo.MenuGroup mg WITH (NOLOCK)
WHERE NULLIF(LTRIM(RTRIM(mg.Name)), '') IS NOT NULL
ORDER BY mg.Id;
"@

$catalogSql = @"
SELECT
    mi.Id AS pos_item_id,
    LTRIM(RTRIM(mi.Code)) AS item_sku,
    LTRIM(RTRIM(mi.Name)) AS item_name,
    mi.MenuGroupId AS pos_menu_group_id,
    COALESCE(
      NULLIF(mi.GrossPrice, 0),
      CASE WHEN mi.Price IS NOT NULL AND mi.Price > 0 THEN ROUND(mi.Price * 1.16, 2) ELSE NULL END,
      0
    ) AS selling_price,
    COALESCE(mi.Status, 'Active') AS item_status,
    mf.Id AS pos_flavour_id,
    LTRIM(RTRIM(mf.Name)) AS variant_name,
    COALESCE(NULLIF(LTRIM(RTRIM(mf.Name2)), ''), CAST(mf.Id AS nvarchar(100))) AS variant_sku,
    COALESCE(
      NULLIF(mf.GrossPrice, 0),
      CASE WHEN mf.Price IS NOT NULL AND mf.Price > 0 THEN ROUND(mf.Price * 1.16, 2) ELSE NULL END,
      NULL
    ) AS variant_selling_price,
    COALESCE(mf.Status, 'Active') AS variant_status
FROM dbo.MenuItem mi WITH (NOLOCK)
LEFT JOIN dbo.ModifierFlavour mf WITH (NOLOCK) ON mf.MenuItemId = mi.Id
WHERE NULLIF(LTRIM(RTRIM(mi.Code)), '') IS NOT NULL
  AND COALESCE(mi.Status, 'Active') = 'Active'
  AND (mf.Id IS NULL OR COALESCE(mf.Status, 'Active') = 'Active')
ORDER BY mi.Id, mf.Id;
"@

Write-Host "Reading SCPGT config: $AppsettingsPath"
$appsettings = Read-JsonFile $AppsettingsPath
$connectionString = Get-PosConnectionString $appsettings

Write-Host "Connecting to MintPOS..."
$menuGroupTable = Invoke-SqlQuery $connectionString $menuGroupsSql
$catalogTable = Invoke-SqlQuery $connectionString $catalogSql

$menuGroups = Convert-DataTableToObjectArray $menuGroupTable
$catalogRows = Convert-DataTableToObjectArray $catalogTable

if (-not $OutputPath -or [string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "mintpos-catalog-export.json"
}

$payload = [ordered]@{
    exported_at = (Get-Date).ToUniversalTime().ToString("o")
    source = "Export-MintPosCatalog.ps1"
    menu_groups = $menuGroups
    catalog_rows = $catalogRows
}

$json = $payload | ConvertTo-Json -Depth 6
Set-Content -Path $OutputPath -Value $json -Encoding UTF8

Write-Host ""
Write-Host "Done."
Write-Host "  Menu groups : $($menuGroups.Count)"
Write-Host "  Catalog rows: $($catalogRows.Count)"
Write-Host "  Saved to    : $OutputPath"
Write-Host ""
Write-Host "Copy that JSON file to your dev PC and run:"
Write-Host "  node firebase/scripts/mintpos-catalog-import-supabase.cjs --from-json <path>"
