import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { completePastBookings, releaseExpiredHolds } from "@/lib/engine/booking";
import { processDueJobs } from "@/lib/notifications/service";

/**
 * Call every minute from a scheduler (Vercel Cron, GitHub Actions, cron + curl):
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" https://your-app/api/cron/tick
 */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const expired = await releaseExpiredHolds();
  const completed = await completePastBookings();
  // recover jobs stuck in SENDING (worker crashed mid-send)
  await prisma.notificationJob.updateMany({ where: { status: "SENDING", sendAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "PENDING" } });
  // Work through the queue in batches until it's empty or the time budget (under the 1-minute schedule) is used.
  // Jobs are claimed one by one, so overlapping runs or several servers never send the same message twice.
  const startedAt = Date.now();
  const jobs = { processed: 0, sent: 0, batches: 0 };
  for (;;) {
    const r = await processDueJobs(100);
    jobs.processed += r.processed;
    jobs.sent += r.sent;
    jobs.batches++;
    if (r.processed < 100 || Date.now() - startedAt > 40_000) break;
  }
  return NextResponse.json({ releasedOccupancyRows: expired, completed: completed.count, ...jobs });
}
export const GET = POST;
