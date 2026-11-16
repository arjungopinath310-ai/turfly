# Saves a new public address (e.g. a new quick-tunnel URL) everywhere Turfly needs it:
#   .env APP_URL and NEXTAUTH_URL, and mobile/.turfly-url (used by the next APK build).
#   powershell -ExecutionPolicy Bypass -File scripts\set-public-url.ps1 https://example.trycloudflare.com
# Afterwards restart the website server: scripts\restart-server.ps1 (no rebuild needed).
param([Parameter(Mandatory = $true)][string]$Url)

$Url = $Url.Trim().TrimEnd("/")
if ($Url -notmatch '^https://[A-Za-z0-9.-]+$') {
  Write-Error "Give the full https address with nothing after the host, e.g. https://example.trycloudflare.com"
  exit 1
}
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { Write-Error ".env not found in $root"; exit 1 }

$lines = Get-Content $envFile
$found = @{ APP_URL = $false; NEXTAUTH_URL = $false }
$out = foreach ($line in $lines) {
  if ($line -match '^(APP_URL|NEXTAUTH_URL)=') { $found[$Matches[1]] = $true; "$($Matches[1])=`"$Url`"" } else { $line }
}
foreach ($k in @("APP_URL", "NEXTAUTH_URL")) { if (-not $found[$k]) { $out += "$k=`"$Url`"" } }
Copy-Item $envFile "$envFile.bak" -Force
[IO.File]::WriteAllLines($envFile, [string[]]$out)
[IO.File]::WriteAllText((Join-Path $root "mobile\.turfly-url"), "$Url`n")

Write-Host "Saved $Url in .env (backup: .env.bak) and mobile\.turfly-url"
Write-Host "Next: powershell -ExecutionPolicy Bypass -File scripts\restart-server.ps1"
Write-Host "The Android app has the address built in: rebuild the APK (cd mobile; npm run build:debug) and reinstall it."
