# One-time local database setup for Turfly when the PostgreSQL "postgres" password is unknown.
# Run in an *Administrator* PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-db.ps1
#
# What it does:
#   1. Backs up pg_hba.conf and temporarily allows password-less logins from THIS computer only.
#   2. Creates the "turfly" user (password "turfly") and the "turfly" UTF-8 database.
#   3. Optionally sets a new password for the "postgres" admin user.
#   4. Always restores the original pg_hba.conf and restarts PostgreSQL, even if a step fails.

$ErrorActionPreference = "Stop"
$pg      = "C:\Program Files\PostgreSQL\16"
$hba     = "$pg\data\pg_hba.conf"
$backup  = "$hba.turfly-backup"
$psql    = "$pg\bin\psql.exe"
$service = "postgresql-x64-16"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "Please run this in PowerShell opened with 'Run as administrator'." -ForegroundColor Red; exit 1 }

Copy-Item $hba $backup -Force
try {
    # Temporarily trust local connections (127.0.0.1 / ::1 only — not reachable from other computers)
    (Get-Content $backup) -replace 'scram-sha-256', 'trust' | Set-Content $hba -Encoding ascii
    Restart-Service $service
    Start-Sleep -Seconds 3

    & $psql -U postgres -h localhost -v ON_ERROR_STOP=0 -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='turfly') THEN CREATE ROLE turfly LOGIN PASSWORD 'turfly'; ELSE ALTER ROLE turfly LOGIN PASSWORD 'turfly'; END IF; END `$`$;"
    $exists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='turfly'"
    if ($exists -ne "1") {
        & $psql -U postgres -h localhost -c "CREATE DATABASE turfly OWNER turfly ENCODING 'UTF8' TEMPLATE template0;"
    } else { Write-Host "Database 'turfly' already exists, keeping it." }

    $answer = Read-Host "Also set a new password for the 'postgres' admin user? (y/N)"
    if ($answer -match '^[yY]') {
        $secure = Read-Host "New postgres password" -AsSecureString
        $plain  = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        $escaped = $plain -replace "'", "''"
        & $psql -U postgres -h localhost -c "ALTER USER postgres PASSWORD '$escaped';" | Out-Null
        Write-Host "postgres password updated."
    }
}
finally {
    Copy-Item $backup $hba -Force
    Restart-Service $service
    Remove-Item $backup -Force
    Write-Host "Original security settings restored." -ForegroundColor Green
}
Write-Host "Done. The app can now connect as turfly/turfly." -ForegroundColor Green
