# Turfly ⚽ Football turf discovery, teams & booking

Discover, compare and book football turfs, starting in **Manjeri, Kerala**. Built for players, turf owners and platform admins.

* **Players:** OTP / Google sign-in, search by area, PIN, distance, price, format, amenities, rating and free time; list + map view; live colour-coded slot grid; reserve with a **₹49 advance** (balance at venue); teams with WhatsApp invites; match squads; reviews from verified bookings; find-players posts; compare up to 3 turfs; Google Calendar / .ics; receipts.
* **Owners:** register or claim a listing, configure **one 7-a-side pitch convertible into two 5-a-side pitches** (or any custom layout), peak pricing, hours (incl. past midnight), durations, refund policy; day/week/month calendar; walk-in & phone bookings; blocks; balance collection; cancel/refund; reschedule; analytics & settlement ledger.
* **Admin:** approve/reject/suspend turfs, add unclaimed listings + claim links, verify claims, users & roles, payments, refunds, disputes, advance amount, platform fee, commission, default policy, reminders, offers.

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

Reminders and hold expiry run from a cron endpoint:

```bash
curl -X POST -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

## Tests

```bash
npm test                    # engine unit tests (allocation, slots, pricing, policy, time)
npm run test:integration    # against Postgres: concurrency, 7s↔5s rules, webhooks, late payments
npm run typecheck
```

## Seed data honesty
All seeded turfs are **fictional and labelled “Demo listing”**. Real Manjeri turfs should be added by the admin as *unclaimed listings* from public information (with a source note) or registered by their owners. The app never claims live availability unless the owner manages bookings on the platform.
