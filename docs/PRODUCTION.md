# Going to production

## What is already production-ready in the code

| Area | What was done |
|---|---|
| Framework security | Next.js 15.5.29, React 19, next-auth 4.24.15, zod 4: `npm audit` reports **0 vulnerabilities** (Next 14 had critical RCE advisories, one specific to Windows servers) |
| HTTP security headers | Content-Security-Policy, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; `X-Powered-By` removed; Next image optimiser disabled |
| Startup checks | `src/instrumentation.ts` refuses to start in production with missing/weak secrets or half-configured Razorpay; warns about demo mode, test keys, missing SMS or business details |
| Abuse protection | OTP: per phone (5/h, 30 s gap), **per IP (10/h)** and **platform-wide ceiling** (`OTP_GLOBAL_PER_HOUR`, default 500) against SMS-pumping fraud; chat 20 msg/min; holds max 2 per user |
| Authorization | Every admin/owner page and server action checks permissions itself (not only layouts) |
| Privacy & compliance | Terms, Privacy (DPDP Act 2023, Grievance Officer), Refund policy, Contact, public account-deletion page; **in-app account deletion** and **data export** (Profile → Your data) |
| Push notifications | FCM HTTP v1 sender; device tokens; every in-app notification also pushed; tokens removed on sign-out/uninstall |
| PWA | Web manifest, icons, offline page via service worker (pages/API never cached) |
| Ops | `/api/health` (DB check), Dockerfile (standalone, non-root, healthcheck), `docker-compose.prod.yml` (db, migrations, app, cron, Cloudflare tunnel), GitHub Actions CI (typecheck, unit, DB integration tests, audit, build) |
| Data | `SEED_DEMO=false` seeds only cities + admin |

## What you need to provide (cannot be done in code)

| # | Item | Why | Where it goes |
|---|---|---|---|
| 1 | **Domain** (e.g. turfly.in, ~₹800/yr) | Permanent address for the site and the app; needed by Razorpay, Google Play, Firebase | DNS at Cloudflare |
| 2 | **Hosting**: a cloud VM (e.g. 2 vCPU / 4 GB, ~₹1,500–2,500/month) running `docker-compose.prod.yml`, or keep this PC + a named Cloudflare tunnel | Always-on server; this PC must stay on otherwise | — |
| 3 | **Business details**: legal name, registered address, support email/phone, Grievance Officer | Legal pages, Razorpay KYC, Play listing | `BUSINESS_*`, `SUPPORT_*`, `GRIEVANCE_*` env |
| 4 | **Razorpay account** with KYC (PAN, bank account, business proof); live keys + webhook secret | Real payments and refunds | `RAZORPAY_*` env; webhook → `https://<domain>/api/payments/webhook` |
| 5 | **MSG91 account** + **DLT registration** (entity + OTP/booking SMS templates, mandatory in India) | OTP SMS to players | `MSG91_*` env |
| 6 | **Firebase project** (free) | Push notifications | `google-services.json` in the app, `FCM_SERVICE_ACCOUNT_JSON` on the server |
| 7 | **Google Play Console** account (US$25 one-time) | Publishing the app | — |
| 8 | **Upload signing key** for the app (you create it and keep the password) | Signing releases | `mobile/keystore.properties` |
| 9 | **WhatsApp Business (Meta Cloud API)**: a business number, a permanent access token, and these approved message templates (English, body variables in this order): `booking_confirmed` (code, turf, when, team, paid online, due at turf, link), `reminder_24h` / `reminder_2h` (turf, when, code, directions), `balance_pending` (amount, turf, when), `owner_new_booking` (code, turf, when, player/team, pitch, to collect, link) | Booking confirmations and reminders to players, and every new booking to the turf owner | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` env |
| 9b | Optional: Resend email, Google sign-in | More channels | env |
| 10 | Lawyer review of Terms/Privacy/Refund pages | They are templates | — |

## Launch steps (cloud VM with Docker)

```bash
git clone https://github.com/arjungopinath310-ai/turfly && cd turfly
cp .env.example .env.production      # fill in every value; NODE_ENV is set by the image
#   NEXTAUTH_SECRET=$(openssl rand -base64 32)   CRON_SECRET=$(openssl rand -hex 24)
#   DEMO_MODE=false  OTP_DEV_ECHO=false  SEED_DEMO=false  ADMIN_PHONES=+91<your number>
#   APP_URL=NEXTAUTH_URL=https://turfly.in   POSTGRES_PASSWORD=<random>
docker compose -f docker-compose.prod.yml --env-file .env.production --profile tunnel up -d --build
docker compose -f docker-compose.prod.yml logs -f app   # look for [env] warnings
```
Cloudflare: Zero Trust → Networks → Tunnels → create a tunnel, copy its token into `CLOUDFLARE_TUNNEL_TOKEN`,
add a public hostname `turfly.in → http://app:3000`.

## After launch

- **Backups:** `docker compose exec db pg_dump -U turfly turfly | gzip > turfly-$(date +%F).sql.gz` daily (cron), copy off the server; test a restore monthly.
- **Monitoring:** an uptime monitor (e.g. UptimeRobot, free) on `https://turfly.in/api/health`.
- **Updates:** `git pull && docker compose ... up -d --build` (migrations run automatically).
- Remove demo data if it was ever seeded: Admin → Turfs → suspend demo listings.
