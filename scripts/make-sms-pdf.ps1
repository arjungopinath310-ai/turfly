# Regenerates the SMS template documents from src/lib/notifications/sms.ts and prints docs/Turfly-SMS-Templates.pdf.
#   powershell -ExecutionPolicy Bypass -File scripts\make-sms-pdf.ps1
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
npx tsx scripts/make-sms-docs.ts
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error "Microsoft Edge not found"; exit 1 }
$html = Join-Path $root "docs\guide\sms-templates.html"
$pdf = Join-Path $root "docs\Turfly-SMS-Templates.pdf"
& $edge --headless=new --disable-gpu "--user-data-dir=$env:TEMP\turfly-pdf-profile" --no-pdf-header-footer --virtual-time-budget=5000 "--print-to-pdf=$pdf" ([System.Uri]$html).AbsoluteUri | Out-Null
Start-Sleep -Seconds 2
if (Test-Path $pdf) { Write-Host "Wrote $pdf ($([math]::Round((Get-Item $pdf).Length / 1KB)) KB)" } else { Write-Error "PDF was not created" }
