param(
    [string]$PublishOutput = "publish",
    [string]$InstallPath = "C:\\Program Files\\PosSyncService",
    [string]$ConfigRoot = "C:\\Users\\aliel\\AppData\\Local\\XtZ",
    [switch]$SkipPublish
)

$ErrorActionPreference = 'Stop'

$DefaultSupabaseUrl = "https://uqpqrmuqbctxbnmgvrgk.supabase.co"
$DefaultSupabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHFybXVxYmN0eGJubWd2cmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTMxNDQ2MywiZXhwIjoyMDgwODkwNDYzfQ.SHHuIQYPTNBpRP0dwaToaRduF8KaVRfk493JgJKYkw8"

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function IsPlaceholder($val) {
    return [string]::IsNullOrWhiteSpace($val) -or $val -eq "https://YOUR-PROJECT.supabase.co" -or $val -eq "SUPABASE_SERVICE_ROLE_KEY"
}

# 1) Publish (self-contained win-x64)
if (-not $SkipPublish) {
    Write-Info "Publishing self-contained win-x64 build..."
    dotnet publish "..\pos-sync-service.csproj" -c Release -r win-x64 --self-contained true -o $PublishOutput
}

# 2) Copy binaries
Write-Info "Ensuring install path $InstallPath"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Write-Info "Copying binaries to $InstallPath"
Copy-Item -Recurse -Force "$PublishOutput\*" $InstallPath

# 3) Ensure config root exists and seed appsettings.json
Write-Info "Ensuring config root $ConfigRoot"
New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
if (-not (Test-Path "$ConfigRoot\appsettings.json")) {
    Write-Warn "No appsettings.json at $ConfigRoot. Copying template from publish output. Edit it before starting the service."
    Copy-Item "$PublishOutput\appsettings.json" "$ConfigRoot\appsettings.json"
}

$configPath = "$ConfigRoot\appsettings.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
if ($null -eq $config.Supabase) {
    $config | Add-Member -MemberType NoteProperty -Name Supabase -Value ([PSCustomObject]@{})
}
$supUpdated = $false
if (IsPlaceholder($config.Supabase.Url)) {
    $config.Supabase.Url = $DefaultSupabaseUrl
    $supUpdated = $true
}
if (IsPlaceholder($config.Supabase.ServiceKey)) {
    $config.Supabase.ServiceKey = $DefaultSupabaseServiceKey
    $supUpdated = $true
}
if ($supUpdated) {
    Write-Info "Prefilling Supabase Url/ServiceKey in $configPath"
    $config | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath -Encoding UTF8
}

$svcName = "PosSupabaseSync"
$svcExe = Join-Path $InstallPath "PosSyncService.exe"
$binArgs = "\"$svcExe\" --run-as-service --contentRoot \"$ConfigRoot\""

# 4) Install/update service
if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
    Write-Info "Service $svcName already exists. Stopping and updating BinaryPathName."
    Stop-Service -Name $svcName -ErrorAction SilentlyContinue
    sc.exe config $svcName binPath= $binArgs | Out-Null
} else {
    Write-Info "Creating service $svcName"
    New-Service -Name $svcName -BinaryPathName $binArgs -DisplayName "POS -> Supabase Sync" -Description "Sync POS sales to Supabase" -StartupType Automatic
}

# 5) Start service
Write-Info "Starting service $svcName"
Start-Service -Name $svcName
Write-Info "Service status:"
Get-Service -Name $svcName | Format-Table Name,Status,StartType -AutoSize
