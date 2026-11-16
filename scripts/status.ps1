# Checks every part of Turfly on this PC and says what to do if something is wrong.
#   powershell -ExecutionPolicy Bypass -File scripts\status.ps1
$root = Split-Path -Parent $PSScriptRoot
$problems = 0
function Ok($t) { Write-Host "[ OK ] $t" -ForegroundColor Green }
function Bad($t, $fix) { Write-Host "[FAIL] $t" -ForegroundColor Red; Write-Host "       Fix: $fix"; $script:problems++ }

$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pg -and $pg.Status -eq "Running") { Ok "Database ($($pg.Name)) is running" }
else { Bad "Database is not running" "Administrator PowerShell: Start-Service postgresql-x64-16" }

$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cloudflared.exe'"
$server = $procs | Where-Object { $_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next`"?\s+start" }
$cron = $procs | Where-Object { $_.CommandLine -match "cron-loop\.mjs" }
$tunnel = $procs | Where-Object { $_.Name -eq "cloudflared.exe" }

if ($server) {
  try {
    $h = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 5
    if ($h.status -eq "ok") { Ok "Website server answers on http://localhost:3000 (database $($h.db))" }
    else { Bad "Website server is unhealthy: $($h | ConvertTo-Json -Compress)" "Check the 'Turfly server' window for errors" }
  } catch { Bad "Website server process exists but does not answer" "Run scripts\stop-all.ps1 then scripts\start-all.ps1" }
} else { Bad "Website server is not running" "Run scripts\start-all.ps1" }

if ($cron) { Ok "Reminders loop is running" } else { Bad "Reminders loop is not running (holds won't expire, no reminders)" "In the turfly folder: npm.cmd run cron:local" }

$url = (Select-String -Path (Join-Path $root ".env") -Pattern '^APP_URL="?([^"]+)"?' | Select-Object -First 1).Matches.Groups[1].Value
if ($tunnel) {
  try {
    $r = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) { Ok "Public address works: $url" } else { Bad "Public address returned $($r.StatusCode): $url" "Check the 'Turfly public tunnel' window" }
  } catch {
    Bad "Public address does not work: $url" "The quick tunnel may have expired. Run scripts\stop-all.ps1 then scripts\start-all.ps1 (gives a new address)"
  }
} else { Bad "Public tunnel is not running" "Run scripts\stop-all.ps1 then scripts\start-all.ps1" }

$free = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
if ($free -gt 2) { Ok "Free disk space on C: $free GB" } else { Bad "Low disk space on C: $free GB" "Free up space; the database and builds need room" }

Write-Host ""
if ($problems -eq 0) { Write-Host "Everything is running." -ForegroundColor Green } else { Write-Host "$problems problem(s) found. See docs\Turfly-Admin-Guide.pdf, section Troubleshooting." -ForegroundColor Yellow }
