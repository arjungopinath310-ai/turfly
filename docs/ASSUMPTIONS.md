# Assumptions & Decisions

These were made before implementation. Each is a deliberate default that can be changed.

## Product
1. **Working name: "Turfly".** Rename freely — the brand appears only in `src/lib/brand.ts` and the layout.
2. **Launch city is Manjeri, Kerala** (PIN 676121–676123). Cities are rows in the `City` table, so more cities/regions are data, not code.
3. **Time zone is IST (UTC+05:30) for all cities.** India has a single time zone without DST, so slot maths uses a fixed offset. All timestamps are stored in UTC.
4. **Operating hours may cross midnight** (common for Kerala turfs that run till 1–2 AM). An operating day is described as minutes from 00:00 of that day, and `closeMinute` may be up to 1800 (06:00 next day).
5. **Money is stored as integer paise.** ₹49 = `4900`. No floating-point money anywhere.
6. **The ₹49 advance is a platform setting (`advanceAmountPaise`)**, default 4900, editable by the admin. It is never larger than the slot price.
7. **The advance is part of the turf price, not an extra charge.** ₹1,500 slot → ₹49 online + ₹1,451 at venue. Any platform/convenience fee is a separate, admin-configured line item (default ₹0) and is always displayed before payment.
8. **Commission is never silently taken from the advance.** Commission is configured per turf (falling back to a platform default, initially 0%), recorded as explicit ledger entries, and shown to the owner in their dashboard. Customers never see it reduce their balance.
9. **Discounts/offers reduce the venue price (balance), never the advance**, so an offer can't make the online amount zero and break the reservation mechanism.

## Availability honesty
10. Each turf has an `availabilityMode`:
    - `LIVE` — owner manages bookings on the platform; walk-ins are entered here. Bookable online. Badge: **"Live availability"**.
    - `OWNER_REPORTED` — owner updates availability manually; we show "Owner-reported · updated X ago" and the slot grid is informational only.
    - `NONE` — unclaimed/public listing; we show contact details only and **never** show a slot grid.
11. **Unclaimed listings** are added by the admin from publicly identifiable information (name, address, map location, public phone) with a `sourceNote`. The admin generates a claim link for the owner. We do not scrape or access any private booking systems.
12. **Seed data is fictional demo data**, flagged `isDemo = true` and labelled "Demo listing" in the UI. Real Manjeri turfs must be added by the admin (as unclaimed listings) or registered by owners — I did not invent details about real businesses.

## Booking engine
13. **Resource model:** a turf has *resource units* (physical areas such as "Half A", "Half B", or virtual locks). A *pitch configuration* (what customers book, e.g. "Full 7-a-side") consumes a set of units. Two bookings conflict **iff** their unit sets intersect **and** their time ranges overlap. This one rule produces every behaviour required for the 7-a-side ↔ 2 × 5-a-side pitch and generalises to any layout.
14. **"Halves cannot run simultaneously"** is modelled by adding a shared virtual unit to both half configurations.
15. **The overlap example:** with Half A booked 18:00–19:00 and Half B booked 19:00–20:00, the engine evaluates each requested interval on its own. The full pitch is unavailable *for any interval that overlaps an occupied half* (so 18:00–19:00 and 19:00–20:00 are each correctly blocked because one half is in use), but it is **not** treated as one merged 18:00–20:00 block — e.g. a 17:00–18:00 or 20:00–21:00 full-pitch booking is available, and Half A remains free 19:00–20:00. This is the only physically correct interpretation; a full-pitch booking needs both halves free for its whole duration.
16. **Concurrency is enforced by PostgreSQL**, not application code: an `EXCLUDE USING gist` constraint on `(unitId, tstzrange(startAt, endAt))` for non-released occupancy rows makes double booking impossible even under simultaneous requests or multiple server instances.
17. **Holds last 5 minutes** (platform setting `holdMinutes`). Expired holds are released lazily on every booking/availability request and by the cron endpoint.
18. **A booking is confirmed only by the payment-gateway webhook** (`payment.captured` / `order.paid`) after HMAC verification. The browser callback is recorded but never confirms anything.
19. If a payment is captured **after** the hold expired, the system tries to re-acquire the slot; if someone else took it, the payment is automatically refunded in full.
20. A user may hold at most 2 slots at once (anti-squatting).
21. Slots start on a grid (`slotStepMinutes`, default 30) and durations come from `allowedDurations` (default 60/90/120).

## Payments
22. **Razorpay** (Orders API + Checkout.js + webhooks). Auto-capture must be enabled in the Razorpay dashboard. Until keys are configured, a clearly-labelled **mock gateway** runs the exact same webhook code path for development; it is disabled in production unless `ALLOW_MOCK_PAYMENTS=true`.
23. UPI, cards, net banking and wallets are offered by Razorpay Checkout itself — no separate integration per method.
24. Funds settle to the platform's Razorpay account; owner payouts are tracked in the ledger. Razorpay Route (direct split settlement to owners) is a documented next step and needs separate KYC per owner.

## Cancellation & refunds
25. Policies are JSON tiers per turf (fallback: platform default), e.g. ≥24 h → 100 %, ≥6 h → 50 %, otherwise 0 %. The exact refund outcome for the ₹49 advance is rendered in plain language **before payment** and snapshotted onto the booking so later policy edits don't change past bookings.
26. Owner-initiated cancellations always refund 100 % of what was paid online.

## Auth & privacy
27. Phone OTP is the primary sign-in (SMS via MSG91 when configured; in development the code is printed to the server log and shown on screen). Google sign-in is enabled when `GOOGLE_CLIENT_ID/SECRET` are set.
28. One account can be a player and an owner. Roles: `PLAYER`, `OWNER`, `ADMIN`. The first admin is created by the seed script / `ADMIN_PHONES` env.
29. **Phone numbers of team members are visible only to the person who entered them (the team owner)** and to members who explicitly enable "share my contact with my teams". Other users see names only. WhatsApp invitations are sent from the organiser's own WhatsApp via share links, so the platform never needs others' numbers.
30. Image uploads (team logos, player photos) are resized client-side to ≤256 px and stored as data URLs. Turf photos are URLs. Swap for S3/Cloudinary at scale.

## Scope delivered vs. next phase
See `docs/ARCHITECTURE.md` → "Roadmap". Core flows (discovery, booking engine, payments, teams, owner & admin dashboards, reviews, find-players, comparison, WhatsApp sharing, notifications/reminders, offers) are implemented. Tournaments UI, split payments, open-match per-player payments, loyalty points and match statistics have schema/architecture notes but no UI yet.
