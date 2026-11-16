# Turfly ⚽ Football turf discovery, teams & booking

Discover, compare and book football turfs, starting in **Manjeri, Kerala**. Built for players, turf owners and platform admins.

* **Players:** OTP / Google sign-in, search by area, PIN, distance, price, format, amenities, rating and free time; list + map view; live colour-coded grid of **1-hour slots**; reserve with a **₹49 advance** (balance at venue); teams with WhatsApp invites; match squads; reviews from verified bookings; find-players posts; compare up to 3 turfs; Google Calendar / .ics; receipts; **chat with turfs** (Messages).
* **Owners:** register or claim a listing, configure **one 7-a-side pitch convertible into two 5-a-side pitches** (or any custom layout), peak pricing, hours (incl. past midnight), durations, refund policy; day/week/month calendar; walk-in & phone bookings; blocks; balance collection; cancel/refund; reschedule; **analytics view** (utilisation heatmap, revenue per day, sources, lead time, top teams, CSV export) & settlement ledger; **chat with customers**.
* **Admin:** approve/reject/suspend turfs, add unclaimed listings + claim links, verify claims, users & roles, payments, refunds, disputes, advance amount, platform fee, commission, default policy, reminders, offers.

📘 **[How the app works (PDF guide)](docs/Turfly-How-It-Works.pdf)**: players, owners, admin, booking rules, hosting and go-live checklist.

📱 **Android app:** [docs/ANDROID.md](docs/ANDROID.md) (Capacitor app in `mobile/`, package `in.turfly.app`).
🚀 **Going live:** [docs/PRODUCTION.md](docs/PRODUCTION.md): what is production-ready, what you need to provide, Docker deployment.

Read **[docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)** (decisions made before building) and **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** (booking engine, payments, security, deployment, roadmap).

## Quick start (local)

Requirements: Node 20+, Docker (for Postgres).

```bash
cp .env.example .env            # then set NEXTAUTH_SECRET
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev                     # http://localhost:3000
```

Sign in with any seeded number; in development the OTP is shown on screen:

| Role | Phone |
|---|---|
| Admin | `+91 99999 99999` (or the first number in `ADMIN_PHONES`) |
| Demo owner | `+91 90000 00001` |
| Demo player | `+91 90000 00002` |

Without Razorpay keys, checkout shows a **mock gateway** that sends a simulated webhook through the real confirmation code. Add `RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET` to use Razorpay test mode (expose `/api/payments/webhook` with a tunnel such as `ngrok` for local webhook delivery).

On Windows PowerShell use `npm.cmd` instead of `npm` if scripts are blocked. If you installed PostgreSQL directly and don't know the `postgres` password, run `scripts/setup-local-db.ps1` in an Administrator PowerShell to create the `turfly` user and database.

### Sharing it on the internet from your PC (demo)

```bash
npm run build && npm start                              # production server on :3000
cloudflared tunnel --url http://localhost:3000          # prints a public https://….trycloudflare.com address
npm run cron:local                                      # reminders + hold clean-up every minute
```

Put the tunnel address in `.env` as `APP_URL` and `NEXTAUTH_URL`, keep `DEMO_MODE="true"` until SMS and Razorpay are connected, and list your own number in `ADMIN_PHONES`. Admin and real-owner OTPs are never shown on screen; they print in the server window. For real customers use permanent hosting (see the PDF guide, section 16).

Reminders and hold expiry run from a cron endpoint:

```bash
curl -X POST -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

## Running it on this PC (admin)

Start, stop, check, back up and troubleshoot without a developer: see **docs/Turfly-Admin-Guide.pdf**.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\status.ps1     # is everything OK?
powershell -ExecutionPolicy Bypass -File scripts\stop-all.ps1   # stop
powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1  # start (prints the public address)
```

## Tests

```bash
npm test                    # engine unit tests (allocation, slots, pricing, policy, time)
npm run test:integration    # against Postgres: concurrency, 7s↔5s rules, webhooks, late payments
npm run typecheck
```

## Seed data honesty
All seeded turfs are **fictional and labelled “Demo listing”**. Real Manjeri turfs should be added by the admin as *unclaimed listings* from public information (with a source note) or registered by their owners. The app never claims live availability unless the owner manages bookings on the platform.
