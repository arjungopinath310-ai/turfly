# Scaling Turfly

Turfly is one codebase (Next.js + PostgreSQL) that serves the website, the Android app (a Capacitor wrapper of the
website) and the API. It is built to grow from this PC to several servers **without rewriting code**: only hosting
and settings change.

## What is already ready for many servers

| Part | How it scales |
|---|---|
| Sign-in sessions | Signed tokens (JWT): any server can check them. All servers need the same `NEXTAUTH_SECRET`. |
| Sign-in codes, rate limits | Stored in the database, so limits hold across servers. |
| Double booking | Prevented by the database itself (exclusion constraint), not by app code. |
| Background jobs (reminders, holds, finishing matches) | `POST /api/cron/tick` every minute from **one** scheduler. Jobs are claimed one by one, so overlapping runs never send twice; each run works through the queue in batches for up to 40 s. |
| Turf search | Filters run in the database; a light first pass sorts all matches, full details load only for the page shown (24 per page). "Near me" uses a latitude/longitude box first. No cap on the number of turfs. |
| Photos | `STORAGE_DRIVER=s3` puts them in a shared bucket (Cloudflare R2, AWS S3, Backblaze B2, MinIO). The default `disk` works only with one server. |
| Platform settings | Cached for 30 s per server; a change reaches every server within 30 s. |
| Sign-in check on every page | An active account is remembered for 30 s per server; a suspension takes effect within 30 s (pages and APIs re-check the user). |
| Database indexes | On the hot paths: turf filters and location, bookings by turf/user/time and by status/end, occupancy by pitch and time, notifications by user and read state, job queue by status and time. |
| Container | `Dockerfile` (small standalone server, health check) and `docker-compose.prod.yml` (database, app, cron, optional Cloudflare tunnel). |

## Growth path

**1. Today: this PC.** Fine for a demo and the first users. Limits: the PC must stay on, and the free tunnel's
address changes on every restart (the Android app then needs a new build).

**2. One cloud server** (for example 2 vCPU / 4 GB RAM) with your own domain. Run
`docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build` and the Cloudflare named tunnel
(profile `tunnel`) or a reverse proxy with HTTPS. The address never changes, so the app is built once. Daily database
backups off the server. This comfortably handles thousands of players a day.

**3. Several app servers.** Move the database to a managed PostgreSQL service with connection pooling, run two or
more app containers behind a load balancer, switch photos to a bucket (`STORAGE_DRIVER=s3`), and keep **one**
scheduler calling `/api/cron/tick` every minute. Add error tracking and uptime monitoring.

**4. Large scale.** A read replica for owner/admin analytics, a CDN in front of the photo bucket
(`S3_PUBLIC_URL`), and a dedicated queue service for messages if volumes demand it.

## Settings for more than one server

- Every server: the same `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`/`APP_URL` (the public domain),
  `CRON_SECRET`, payment and SMS keys.
- Database connections: each server opens a small pool. With many servers, cap it so the total stays under the
  database's limit, e.g. `DATABASE_URL=...?schema=public&connection_limit=10&pool_timeout=20`, or put PgBouncer /
  the provider's pooler in front (then add `&pgbouncer=true`).
- Photos: `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional
  `S3_REGION` (default `auto`) and `S3_PUBLIC_URL` (public bucket or CDN address; without it photos are streamed
  through `/api/uploads/<name>`). Copy the existing `uploads` folder into the bucket when switching.
- Run database migrations once per release (`npx prisma migrate deploy`), not from every server.

## Checklist before adding a second server

1. Domain and HTTPS in place; `NEXTAUTH_URL`/`APP_URL` set to it.
2. Database moved off the app server, with backups and connection limits.
3. `STORAGE_DRIVER=s3` set and existing photos copied to the bucket.
4. Exactly one scheduler calling `/api/cron/tick`.
5. Health check (`/api/health`) wired to the load balancer.
