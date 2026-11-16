# Installs what is needed to build the Turfly Android app on Windows:
#   - checks for Java 21 (install it first with: winget install Microsoft.OpenJDK.21)
#   - downloads Google's Android command-line tools (checksum verified) to %LOCALAPPDATA%\Android\Sdk
#   - shows Google's Android SDK license terms for YOU to read and accept
#   - installs platform-tools, the Android 16 (API 36) platform and build-tools (~1 GB)
# Run from PowerShell:  powershell -ExecutionPolicy Bypass -File mobile\scripts\install-android-sdk.ps1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$jdk = Get-ChildItem "C:\Program Files\Microsoft" -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
if (-not $jdk) { throw "Java 21 not found. Install it first:  winget install Microsoft.OpenJDK.21" }
$env:JAVA_HOME = $jdk.FullName
Write-Host "Java: $($jdk.FullName)"

$sdkmanager = Join-Path $sdk "cmdline-tools\latest\bin\sdkmanager.bat"
if (-not (Test-Path $sdkmanager)) {
  $url = "https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip"
  $sha1 = "57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d"
  $zip = Join-Path $env:TEMP "android-cmdline-tools.zip"
  Write-Host "Downloading Android command-line tools from Google (155 MB)..."
  Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
  if ((Get-FileHash $zip -Algorithm SHA1).Hash.ToLower() -ne $sha1) { Remove-Item $zip; throw "Checksum mismatch: download corrupted or tampered with." }
  $tmp = Join-Path $sdk "_tmp"
  Expand-Archive $zip $tmp -Force
  New-Item -ItemType Directory -Force (Join-Path $sdk "cmdline-tools") | Out-Null
  Move-Item (Join-Path $tmp "cmdline-tools") (Join-Path $sdk "cmdline-tools\latest")
  Remove-Item $tmp -Recurse -Force
  Remove-Item $zip
  Write-Host "Command-line tools installed (checksum verified)." -ForegroundColor Green
}

Write-Host ""
Write-Host "By installing, you agree to Google's Android SDK terms: https://developer.android.com/studio/terms" -ForegroundColor Yellow
Write-Host "Installing Android SDK packages (about 1 GB)..."
# Google's new Android CLI ('android sdk', replaces sdkmanager) names packages with '/' instead of ';'.
$android = Join-Path $sdk "cmdline-tools\latest\bin\android.exe"
if (Test-Path $android) {
  & $android --sdk="$sdk" sdk install "platform-tools" "platforms/android-36" "build-tools/35.0.0"
} else {
  & $sdkmanager --licenses
  & $sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;35.0.0"
}
if ($LASTEXITCODE -ne 0) { throw "SDK package install failed." }
foreach ($p in @("platforms\android-36", "build-tools\35.0.0", "platform-tools")) {
  if (-not (Test-Path (Join-Path $sdk $p))) { throw "Missing $p after install." }
}

Write-Host ""
Write-Host "Android SDK ready at $sdk" -ForegroundColor Green
Write-Host "Next: cd mobile; npm run build:debug"
