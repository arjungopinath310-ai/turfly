# Saves a full copy of the Turfly database to backups\turfly-YYYYMMDD-HHMM.dump (keeps the newest 14).
#   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
# Restore (replaces ALL current data):  see docs\Turfly-Admin-Guide.pdf, section Backups.
$root = Split-Path -Parent $PSScriptRoot
$pgBin = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory | Sort-Object Name -Descending | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName "bin" }
if (-not $pgBin -or -not (Test-Path (Join-Path $pgBin "pg_dump.exe"))) { Write-Error "pg_dump.exe not found under C:\Program Files\PostgreSQL"; exit 1 }
$dbUrl = (Select-String -Path (Join-Path $root ".env") -Pattern '^DATABASE_URL="?([^"]+)"?' | Select-Object -First 1).Matches.Groups[1].Value
if (-not $dbUrl) { Write-Error "DATABASE_URL not found in .env"; exit 1 }
$dbUrl = $dbUrl -replace '\?.*$', ''  # pg_dump does not understand Prisma's ?schema= option
$dir = Join-Path $root "backups"
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir ("turfly-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".dump")
& (Join-Path $pgBin "pg_dump.exe") --format=custom --no-owner --file "$file" "$dbUrl"
if ($LASTEXITCODE -ne 0) { Write-Error "Backup failed"; exit 1 }
Get-ChildItem $dir -Filter "turfly-*.dump" | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Force
Write-Host "Backup saved: $file ($([math]::Round((Get-Item $file).Length / 1MB, 2)) MB)"
Write-Host "Copy it somewhere off this PC (Google Drive, USB) so a broken PC doesn't lose the data."
