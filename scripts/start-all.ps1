# Starts Turfly on this PC: public tunnel, website server and reminders loop, each in its own window.
# The new public address is saved automatically (.env and mobile\.turfly-url).
#   powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1            start
#   powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1 -Rebuild   rebuild first (after code updates)
param([switch]$Rebuild)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

Step "1/5 Database"
$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pg) { Write-Host "PostgreSQL service not found. Is PostgreSQL 16 installed?" -ForegroundColor Red; exit 1 }
if ($pg.Status -ne "Running") {
  Write-Host "PostgreSQL ($($pg.Name)) is $($pg.Status). Trying to start it..."
  try { Start-Service $pg.Name } catch {
    Write-Host "Could not start it. Open PowerShell as Administrator and run:  Start-Service $($pg.Name)" -ForegroundColor Red; exit 1
  }
}
Write-Host "PostgreSQL is running ($($pg.Name))"

if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "Port 3000 is already in use: Turfly (or something else) is already running. Run scripts\stop-all.ps1 first." -ForegroundColor Yellow
  exit 1
}

Step "2/5 Build"
if ($Rebuild -or -not (Test-Path (Join-Path $root ".next\BUILD_ID"))) {
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { Write-Host "Build failed. See docs\Turfly-Admin-Guide.pdf (Troubleshooting)." -ForegroundColor Red; exit 1 }
} else { Write-Host "Using the existing build (add -Rebuild after code changes)" }

Step "3/5 Public tunnel"
$cf = @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cf) { Write-Host "cloudflared not found. Install it: winget install Cloudflare.cloudflared" -ForegroundColor Red; exit 1 }
$log = Join-Path $env:TEMP "turfly-tunnel.log"
if (Test-Path $log) { Remove-Item $log -Force }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Turfly public tunnel'; & '$cf' tunnel --url http://localhost:3000 --no-autoupdate --logfile '$log'"
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) { Write-Host "The tunnel did not report an address within 60 s. Check the 'Turfly public tunnel' window and your internet." -ForegroundColor Red; exit 1 }
& (Join-Path $PSScriptRoot "set-public-url.ps1") $url 6>$null | Out-Null
Write-Host "Public address: $url (saved in .env)"

Step "4/5 Website server and reminders"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Turfly server'; Set-Location '$root'; npm.cmd start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Turfly reminders'; Set-Location '$root'; npm.cmd run cron:local"

Step "5/5 Health check"
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try { $ok = (Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3).status -eq "ok" } catch { }
}
if (-not $ok) { Write-Host "The server did not become healthy within 60 s. Look at the 'Turfly server' window." -ForegroundColor Red; exit 1 }
Write-Host "`nTurfly is running." -ForegroundColor Green
Write-Host "Public address: $url"
Write-Host "It can take up to a minute before the address works everywhere."
Write-Host "Android app: the address changed, so rebuild the APK (cd mobile; npm run build:debug) for the app to reach it."
Write-Host "Real Razorpay keys? Update the webhook URL in the Razorpay dashboard to $url/api/payments/webhook"
