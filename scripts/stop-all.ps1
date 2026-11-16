# Stops Turfly on this PC: website server, reminders loop and public tunnel. The database keeps running.
#   powershell -ExecutionPolicy Bypass -File scripts\stop-all.ps1
$root = Split-Path -Parent $PSScriptRoot
$procs = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq "cloudflared.exe" -and $_.CommandLine -match "localhost:3000") -or
  ($_.Name -eq "node.exe" -and (
    ($_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next`"?\s+start") -or
    ($_.CommandLine -match "cron-loop\.mjs") -or
    ($_.CommandLine -match "npm-cli\.js`"?\s+(start|run cron:local)")))
}
if (-not $procs) { Write-Host "Turfly is not running."; exit 0 }
foreach ($p in $procs) {
  $what = if ($p.Name -eq "cloudflared.exe") { "public tunnel" } elseif ($p.CommandLine -match "cron") { "reminders loop" } else { "website server" }
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "Stopped $what (process $($p.ProcessId))"
}
Write-Host "Done. The windows stay open showing the last output; close them. Start again with scripts\start-all.ps1"
