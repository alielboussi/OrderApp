# One-time GitHub PAT setup for alielboussi/OrderApp
# Create PAT: https://github.com/settings/tokens (classic) with "repo" scope

$ErrorActionPreference = 'Stop'

Write-Host "GitHub PAT setup for alielboussi / OrderApp"
Write-Host "Create a classic token with repo scope:"
Write-Host "  https://github.com/settings/tokens/new?scopes=repo&description=OrderApp"
Write-Host ""

$secure = Read-Host "Paste your GitHub PAT" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $pat = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) | Out-Null
}

if ([string]::IsNullOrWhiteSpace($pat)) {
  throw 'PAT is empty.'
}

# Clear any previously stored credentials for this repo so we definitely use the new PAT.
$credKey = @(
  "protocol=https",
  "host=github.com",
  "path=alielboussi/OrderApp.git",
  "username=alielboussi"
) -join "`n" + "`n"
$credKey | git credential-manager erase 2>&1 | Out-Null

$hostKey = @(
  "protocol=https",
  "host=github.com",
  "username=alielboussi"
) -join "`n" + "`n"
$hostKey | git credential-manager erase 2>&1 | Out-Null

# useHttpPath=true in git config requires repo-specific credential entry
$cred = @(
  "protocol=https",
  "host=github.com",
  "path=alielboussi/OrderApp.git",
  "username=alielboussi",
  "password=$pat"
) -join "`n" + "`n"
$cred | git credential-manager store
# Also store host-level fallback
@(
  "protocol=https",
  "host=github.com",
  "username=alielboussi",
  "password=$pat"
) -join "`n" + "`n" | git credential-manager store

Write-Host "Stored credentials. Testing push..."
Set-Location (Split-Path $PSScriptRoot -Parent)
git push origin master
Write-Host "Done."
