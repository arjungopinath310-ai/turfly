# Prints docs/guide/admin-guide.html to docs/Turfly-Admin-Guide.pdf with headless Microsoft Edge.
#   powershell -ExecutionPolicy Bypass -File scripts\make-admin-pdf.ps1
$root = Split-Path -Parent $PSScriptRoot
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error "Microsoft Edge not found"; exit 1 }
$html = Join-Path $root "docs\guide\admin-guide.html"
$pdf = Join-Path $root "docs\Turfly-Admin-Guide.pdf"
$url = ([System.Uri]$html).AbsoluteUri
& $edge --headless=new --disable-gpu "--user-data-dir=$env:TEMP\turfly-pdf-profile" --no-pdf-header-footer --virtual-time-budget=5000 "--print-to-pdf=$pdf" $url | Out-Null
Start-Sleep -Seconds 2
if (Test-Path $pdf) { Write-Host "Wrote $pdf ($([math]::Round((Get-Item $pdf).Length / 1KB)) KB)" } else { Write-Error "PDF was not created" }
