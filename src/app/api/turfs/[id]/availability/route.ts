import { NextResponse } from "next/server";
import { getAvailability, releaseExpiredHolds } from "@/lib/engine/booking";
import { AppError, handle } from "@/lib/errors";
import { isValidDate, todayIst } from "@/lib/time";

export const GET = handle(async (req, { params }) => {
  const u = new URL(req.url);
  const date = u.searchParams.get("date") ?? todayIst();
  const duration = Number(u.searchParams.get("duration") ?? 60);
  if (!isValidDate(date)) throw new AppError(400, "Invalid date");
  await releaseExpiredHolds();
  const a = await getAvailability(params.id, date, duration);
  if (a.turf.availabilityMode === "NONE") throw new AppError(404, "No availability published for this turf");
  return NextResponse.json(
    {
      mode: a.turf.availabilityMode,
      updatedAt: a.turf.availabilityUpdatedAt,
      bookable: a.turf.availabilityMode === "LIVE" && a.turf.status === "APPROVED",
      hours: a.hours,
      configs: a.configs.map(({ unitIds, ...c }) => c), // unit topology not exposed
    },
    { headers: { "cache-control": "no-store" } },
  );
});
