import { NextResponse } from "next/server";
import { getAvailability, releaseExpiredHolds } from "@/lib/engine/booking";
import { AppError, handle } from "@/lib/errors";
import { findOpenGames } from "@/lib/games";
import { isValidDate, istToUtc, todayIst } from "@/lib/time";

export const GET = handle(async (req, { params }) => {
  const u = new URL(req.url);
  const date = u.searchParams.get("date") ?? todayIst();
  const duration = Number(u.searchParams.get("duration") ?? 60);
  if (!isValidDate(date)) throw new AppError(400, "Invalid date");
  await releaseExpiredHolds();
  const a = await getAvailability(params.id, date, duration);
  if (a.turf.availabilityMode === "NONE") throw new AppError(404, "No availability published for this turf");
  // Booked slots whose players are short: shown as "Join" on the grid (no names, just the game and spots left)
  const dayStart = istToUtc(date, 0);
  const minute = (d: Date) => Math.round((d.getTime() - dayStart.getTime()) / 60_000);
  const games = await findOpenGames({ turfId: params.id, from: dayStart, to: istToUtc(date, 1800) });
  return NextResponse.json(
    {
      mode: a.turf.availabilityMode,
      updatedAt: a.turf.availabilityUpdatedAt,
      bookable: a.turf.availabilityMode === "LIVE" && a.turf.status === "APPROVED",
      hours: a.hours,
      configs: a.configs.map(({ unitIds, ...c }) => c), // unit topology not exposed
      games: games.map((g) => ({
        id: g.id,
        configId: g.booking?.configId ?? null,
        playersPerSide: g.playersPerSide,
        startMinute: minute(g.startAt),
        endMinute: minute(g.booking?.endAt ?? g.startAt),
        spots: g.spots,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
});
