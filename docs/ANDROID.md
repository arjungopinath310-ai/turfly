# Turfly Android app

The Android app (`mobile/`) is a native **Capacitor 8** shell (package `in.turfly.app`, targets Android 16 / API 36,
runs on Android 7+) that shows the live Turfly website, so every feature and fix reaches the app immediately.
Native features added on top:

| Feature | How |
|---|---|
| Push notifications (bookings, reminders, chat) | `@capacitor/push-notifications` + Firebase Cloud Messaging; server sends via FCM HTTP v1 (`src/lib/push.ts`) |
| Hardware back button | `@capacitor/app` (goes back; exits on the home screen) |
| UPI payments | `MainActivity` hands Razorpay's `upi://` / `intent://` links to GPay, PhonePe, Paytm… |
| Downloads (CSV export, calendar, "Download my data") | `MainActivity` DownloadManager with the session cookie → phone's Downloads folder |
| Location ("Near me") | WebView geolocation with Android location permission |
| Offline screen | `www/offline.html` when there is no connection |
| Safe areas / notches | Capacitor SystemBars (`--safe-area-inset-*` CSS variables) |
| Security | HTTPS only, no cloud backup of the session, only Turfly + Razorpay pages open inside the app |

The website detects the app through its user agent (`TurflyApp/<version>`), skips its service worker there, and
registers for push only when the app was built with Firebase (`push=1`).

## 1. Install the build tools (once)

```powershell
winget install Microsoft.OpenJDK.21
powershell -ExecutionPolicy Bypass -File mobile\scripts\install-android-sdk.ps1
```
The script downloads Google's Android command-line tools (checksum verified) to `%LOCALAPPDATA%\Android\Sdk`,
shows Google's SDK terms (https://developer.android.com/studio/terms) and installs platform-tools, Android 16 and build-tools.

## 2. Build a test APK

```powershell
cd mobile
npm install
$env:TURFLY_URL = "https://your-turfly-address"   # remembered in mobile/.turfly-url
npm run build:debug                                # → mobile/dist/turfly-1.0.0-debug.apk
```
Install it on an Android phone: copy the APK to the phone (WhatsApp to yourself, USB, Google Drive) and open it;
allow "Install unknown apps" for that source when asked. Debug builds are for testing only.

> **The app shows whatever site TURFLY_URL points to.** A quick Cloudflare tunnel address changes every restart,
> so rebuild the APK if it changes, or (better) use a permanent domain: see `docs/PRODUCTION.md`.

## 3. Push notifications (Firebase)

1. https://console.firebase.google.com → **Add project** (e.g. "Turfly").
2. **Add app → Android**, package name `in.turfly.app`. Download **google-services.json** into `mobile/android/app/`
   (it is git-ignored). Rebuild: the app now registers for push.
3. Project settings → **Service accounts → Generate new private key**. On the server set
   `FCM_SERVICE_ACCOUNT_JSON` to the base64 of that file:
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("turfly-firebase-adminsdk.json"))`
   Keep this file secret; it can send notifications as Turfly.

## 4. Release build for Google Play

1. Create an upload key **yourself** (choose your own passwords and store them in a password manager):
   ```powershell
   cd mobile
   & "C:\Program Files\Microsoft\jdk-21*\bin\keytool.exe" -genkeypair -v -keystore turfly-upload.jks -alias turfly -keyalg RSA -keysize 4096 -validity 10000
   ```
2. Create `mobile/keystore.properties` (git-ignored):
   ```
   storeFile=turfly-upload.jks
   storePassword=...
   keyAlias=turfly
   keyPassword=...
   ```
3. Bump `"version"` in `mobile/package.json` for every release (versionCode is derived from it), then
   `npm run build:release` → `mobile/dist/turfly-<version>-release.aab`.
4. Back up `turfly-upload.jks` and its passwords. If lost, you must ask Google Play support to reset the upload key.

## 5. Publishing on Google Play (checklist)

- Google Play Console developer account (one-time US$25). New personal accounts must run a **closed test with
  at least 12 testers for 14 days** before production access.
- App listing: name, short/long description, 512×512 icon (`public/icons/icon-512.png`), feature graphic 1024×500,
  at least 2 phone screenshots.
- **Privacy policy URL:** `https://<your-domain>/legal/privacy`
- **Account deletion URL:** `https://<your-domain>/account/delete` (in-app deletion is in Profile → Your data)
- **Data safety form:** collects phone number, name, email (optional), approximate/precise location (optional, not stored),
  purchase history, in-app messages, device ID for push; data encrypted in transit; users can request deletion.
- Content rating questionnaire; target audience 18+ (payments) or "13+ with parental supervision" as you prefer.
- Use Play App Signing (default). Upload the `.aab` to an internal/closed testing track first.
- Payments: bookings are real-world services, so Razorpay is allowed (Google Play Billing is not required).
