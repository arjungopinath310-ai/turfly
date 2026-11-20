/**
 * A player's football life on Turfly: matches played (booked, joined through "Games you can join", or named on
 * a match roster), the people they played with, how reliably they turn up, their weekly goal and badges, and
 * leaderboards. Everything is computed from bookings; nothing here can be bought or edited by hand.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isDemoMode } from "./format";
import { addDays, istParts, istToUtc, todayIst, weekdayOf } from "./time";

const PLAYED = ["CONFIRMED", "COMPLETED"] as const;
// Sample turfs only count in demo mode, so real leaderboards never show sample players
const turfFilter = (): Prisma.TurfWhereInput => (isDemoMode() ? { isSandbox: false } : { isSandbox: false, isDemo: false });

export type Match = { bookingId: string; turfId: string; startAt: Date; endAt: Date; role: "organiser" | "joined" | "roster" };

/** Every past match the player took part in, once each, newest first. */
export async function matchesPlayed(userId: string, now = new Date()): Promise<Match[]> {
  const past = { status: { in: [...PLAYED] }, endAt: { lt: now }, turf: turfFilter() };
  const pick = { id: true, turfId: true, startAt: true, endAt: true } as const;
  const [own, joined, roster] = await Promise.all([
    prisma.booking.findMany({ where: { userId, ...past }, select: pick }),
    prisma.playerPostRequest.findMany({ where: { userId, status: "ACCEPTED", post: { booking: past } }, select: { post: { select: { booking: { select: pick } } } } }),
    prisma.matchPlayer.findMany({ where: { userId, status: { not: "DECLINED" }, booking: past }, select: { booking: { select: pick } } }),
  ]);
  const seen = new Map<string, Match>();
  const add = (b: { id: string; turfId: string; startAt: Date; endAt: Date } | null | undefined, role: Match["role"]) => {
    if (b && !seen.has(b.id)) seen.set(b.id, { bookingId: b.id, turfId: b.turfId, startAt: b.startAt, endAt: b.endAt, role });
  };
  own.forEach((b) => add(b, "organiser"));
  joined.forEach((r) => add(r.post.booking, "joined"));
  roster.forEach((m) => add(m.booking, "roster"));
  return [...seen.values()].sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
}

/** Monday (IST) of the week a date falls in. */
export function weekStart(date: string) {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export const ACTIVITY_LEVELS = [
  { min: 0, label: "Getting started" },
  { min: 1, label: "Regular" },
  { min: 4, label: "Keen" },
  { min: 8, label: "Turf legend" },
] as const;

/** Level from matches played in the last 30 days. */
export function activityLevel(last30: number) {
  let i = 0;
  ACTIVITY_LEVELS.forEach((l, k) => { if (last30 >= l.min) i = k; });
  return { index: i, ...ACTIVITY_LEVELS[i] };
}

export type Badge = { key: string; title: string; hint: string; progress: number; target: number; earned: boolean };

export function badgesFor(s: { matches: Match[]; noShows: number; hosted: number; joinedGames: number; turfs: number; lateNight: number; settled: number }): Badge[] {
  const b = (key: string, title: string, hint: string, progress: number, target: number, extra = true): Badge => ({ key, title, hint, progress: Math.min(progress, target), target, earned: progress >= target && extra });
  return [
    b("on-time", "Always turns up", "5 matches without a no-show", s.matches.length, 5, s.noShows === 0),
    b("team-player", "Team player", "Join 3 games from “Games you can join”", s.joinedGames, 3),
    b("host", "Host", "Book 5 matches for your group", s.hosted, 5),
    b("explorer", "Explorer", "Play at 3 different turfs", s.turfs, 3),
    b("night-owl", "Night owl", "Play 3 matches that start at 9 PM or later", s.lateNight, 3),
    b("settles-up", "Settles up", "Pay at the turf on time for 5 bookings", s.settled, 5),
  ];
}

/** Everything the profile shows. */
export async function playerProfile(userId: string, now = new Date()) {
  const [matches, noShows, user, settled] = await Promise.all([
    matchesPlayed(userId, now),
    prisma.booking.count({ where: { userId, status: "NO_SHOW", turf: turfFilter() } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { weeklyGoal: true, hideFromLeaderboard: true } }),
    prisma.booking.count({ where: { userId, balanceCollectedAt: { not: null }, turf: turfFilter() } }),
  ]);
  const ids = matches.map((m) => m.bookingId);
  // People you played with: the organisers, the players who joined, and named roster players with accounts
  const [rosterMates, joiners, organisers] = ids.length
    ? await Promise.all([
        prisma.matchPlayer.findMany({ where: { bookingId: { in: ids }, userId: { not: null } }, select: { userId: true } }),
        prisma.playerPostRequest.findMany({ where: { status: "ACCEPTED", post: { bookingId: { in: ids } } }, select: { userId: true } }),
        prisma.booking.findMany({ where: { id: { in: ids } }, select: { userId: true } }),
      ])
    : [[], [], []];
  const mates = new Set([...rosterMates, ...joiners, ...organisers].map((x) => x.userId).filter((x): x is string => Boolean(x) && x !== userId));

  const today = todayIst(now);
  const monthAgo = now.getTime() - 30 * 86_400_000;
  const last30 = matches.filter((m) => m.startAt.getTime() >= monthAgo).length;
  // Weekly goal: this week's matches and the run of past weeks that met the goal
  const thisWeek = weekStart(today);
  const perWeek = new Map<string, number>();
  for (const m of matches) {
    const w = weekStart(istParts(m.startAt).date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  let streak = 0;
  if (user.weeklyGoal) {
    for (let w = addDays(thisWeek, -7); (perWeek.get(w) ?? 0) >= user.weeklyGoal; w = addDays(w, -7)) streak++;
    if ((perWeek.get(thisWeek) ?? 0) >= user.weeklyGoal) streak++;
  }
  const lastPlayed = matches[0]?.startAt ?? null;

  return {
    played: matches.length,
    teammates: mates.size,
    noShows,
    // share of booked matches the player turned up for (100% until there is something to measure)
    reliability: matches.length + noShows ? Math.round((100 * matches.length) / (matches.length + noShows)) : 100,
    last30,
    level: activityLevel(last30),
    goal: user.weeklyGoal ? { target: user.weeklyGoal, thisWeek: perWeek.get(thisWeek) ?? 0, streak, weekEnds: addDays(thisWeek, 6) } : null,
    lastPlayed,
    hideFromLeaderboard: user.hideFromLeaderboard,
    badges: badgesFor({
      matches,
      noShows,
      hosted: matches.filter((m) => m.role === "organiser").length,
      joinedGames: matches.filter((m) => m.role === "joined").length,
      turfs: new Set(matches.map((m) => m.turfId)).size,
      lateNight: matches.filter((m) => {
        const minute = Math.round((m.startAt.getTime() - istToUtc(istParts(m.startAt).date, 0).getTime()) / 60000);
        return minute >= 21 * 60 || minute < 4 * 60;
      }).length,
      settled,
    }),
  };
}

export type LeaderRow = { userId: string; name: string; matches: number; rank: number };

/**
 * Players with the most matches in the last 30 days, in one town or across India. Names are shown as
 * "First L." and players who opted out are left off (they still see their own rank).
 */
export async function leaderboard(opts: { cityId?: string | null; limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const demo = isDemoMode();
  const city = opts.cityId ?? null;
  const rows = await prisma.$queryRaw<{ uid: string; matches: number }[]>`
    WITH b AS (
      SELECT bk.id, bk."userId" FROM "Booking" bk JOIN "Turf" t ON t.id = bk."turfId"
      WHERE bk.status IN ('CONFIRMED','COMPLETED') AND bk."endAt" < ${now} AND bk."endAt" >= ${since}
        AND t."isSandbox" = false AND (${demo} OR t."isDemo" = false) AND (${city}::text IS NULL OR t."cityId" = ${city})
    ), played AS (
      SELECT "userId" AS uid, id AS bid FROM b WHERE "userId" IS NOT NULL
      UNION SELECT r."userId", b.id FROM "PlayerPostRequest" r JOIN "PlayerPost" p ON p.id = r."postId" JOIN b ON b.id = p."bookingId" WHERE r.status = 'ACCEPTED'
      UNION SELECT m."userId", b.id FROM "MatchPlayer" m JOIN b ON b.id = m."bookingId" WHERE m."userId" IS NOT NULL AND m.status <> 'DECLINED'
    )
    SELECT uid, COUNT(DISTINCT bid)::int AS matches FROM played GROUP BY uid ORDER BY matches DESC, uid LIMIT 500`;
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.uid) } }, select: { id: true, name: true, hideFromLeaderboard: true, isSuspended: true, deletedAt: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  // Standard competition ranking (1, 2, 2, 4) over everyone, so hiding names doesn't change anyone's rank
  let rank = 0;
  let prev = -1;
  const ranked = rows.map((r, i) => {
    if (r.matches !== prev) [rank, prev] = [i + 1, r.matches];
    return { ...r, rank };
  });
  const shortName = (n: string | null) => {
    const parts = (n ?? "").trim().split(/\s+/).filter(Boolean);
    return parts.length ? `${parts[0]}${parts[1] ? ` ${parts[1][0].toUpperCase()}.` : ""}` : "Player";
  };
  const visible: LeaderRow[] = ranked
    .filter((r) => {
      const u = byId.get(r.uid);
      return u && !u.hideFromLeaderboard && !u.isSuspended && !u.deletedAt;
    })
    .slice(0, opts.limit ?? 50)
    .map((r) => ({ userId: r.uid, name: shortName(byId.get(r.uid)!.name), matches: r.matches, rank: r.rank }));
  const rankOf = (userId: string) => ranked.find((r) => r.uid === userId) ?? null;
  return { rows: visible, rankOf, players: ranked.length };
}

/** The town a player plays in most (for "your town" leaderboards). */
export async function homeCityOf(userId: string) {
  const ms = await matchesPlayed(userId);
  if (!ms.length) return null;
  const counts = new Map<string, number>();
  const turfs = await prisma.turf.findMany({ where: { id: { in: [...new Set(ms.map((m) => m.turfId))] } }, select: { id: true, cityId: true } });
  const cityOf = new Map(turfs.map((t) => [t.id, t.cityId]));
  for (const m of ms) {
    const c = cityOf.get(m.turfId);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
