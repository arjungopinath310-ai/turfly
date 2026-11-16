# Restarts only the website server; the public tunnel keeps running, so the public address does NOT change.
#   powershell -ExecutionPolicy Bypass -File scripts\restart-server.ps1            after editing .env
#   powershell -ExecutionPolicy Bypass -File scripts\restart-server.ps1 -Rebuild   after changing code on this PC
#   powershell -ExecutionPolicy Bypass -File scripts\restart-server.ps1 -Update    get the latest version from GitHub:
#       backup, git pull, install packages, apply database changes, build, start
param([switch]$Rebuild, [switch]$Update)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Update) {
  $Rebuild = $true
  & (Join-Path $PSScriptRoot "backup-db.ps1")
  if ($LASTEXITCODE -ne 0) { Write-Host "Backup failed; nothing was changed." -ForegroundColor Red; exit 1 }
  git pull
  if ($LASTEXITCODE -ne 0) { Write-Host "git pull failed; the site still runs the old version. See the admin guide, section 6." -ForegroundColor Red; exit 1 }
}

$procs = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "node.exe" -and (($_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next`"?\s+start") -or ($_.CommandLine -match "npm-cli\.js`"?\s+start"))
}
foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
if ($procs) { Write-Host "Stopped the website server. Close the old 'Turfly server' window." } else { Write-Host "The website server was not running." }

if ($Update) {
  npm.cmd ci
  if ($LASTEXITCODE -ne 0) { Write-Host "Installing packages failed, so the site is offline. See the admin guide, section 6." -ForegroundColor Red; exit 1 }
  npm.cmd run db:migrate
  if ($LASTEXITCODE -ne 0) { Write-Host "The database update failed, so the site is offline. See the admin guide, section 6." -ForegroundColor Red; exit 1 }
}

if ($Rebuild) {
  Write-Host "Building (the site is offline for 1-2 minutes)..."
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed, so the site is offline. Fix the error, or go back to the previous version (admin guide, section 6) and run this again." -ForegroundColor Red
    exit 1
  }
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = 'Turfly server'; Set-Location '$root'; npm.cmd start"
$ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try { $ok = (Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3).status -eq "ok" } catch { }
}
if ($ok) { Write-Host "Website server is running again. Public address unchanged." -ForegroundColor Green }
else { Write-Host "The server did not answer within 60 s. Look at the 'Turfly server' window." -ForegroundColor Red; exit 1 }
