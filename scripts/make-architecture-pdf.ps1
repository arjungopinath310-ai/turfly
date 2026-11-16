# Prints docs/guide/architecture.html to docs/Turfly-Architecture.pdf with headless Microsoft Edge.
#   powershell -ExecutionPolicy Bypass -File scripts\make-architecture-pdf.ps1
$root = Split-Path -Parent $PSScriptRoot
python -I (Join-Path $root "scripts\make-architecture-doc.py")
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error "Microsoft Edge not found"; exit 1 }
$html = Join-Path $root "docs\guide\architecture.html"
$pdf = Join-Path $root "docs\Turfly-Architecture.pdf"
$profileDir = Join-Path $env:TEMP "turfly-pdf-profile"
$url = ([System.Uri]$html).AbsoluteUri
& $edge --headless=new --disable-gpu "--user-data-dir=$profileDir" --no-pdf-header-footer --virtual-time-budget=5000 "--print-to-pdf=$pdf" $url | Out-Null
Start-Sleep -Seconds 2
if (Test-Path $pdf) { Write-Host "Wrote $pdf ($([math]::Round((Get-Item $pdf).Length / 1KB)) KB)" } else { Write-Error "PDF was not created" }
