import type { Booking, Prisma, User } from "@prisma/client";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";
import { displayName } from "./format";
import { createNotification } from "./notifications/service";
import { queuePush } from "./push";
import { formatIst } from "./time";
import { maxPlayersNeeded, spotsLeft, suggestShare } from "./games-shared";

/**
 * Open games ("short of players").
 * - The player who booked a slot lists it with the number of players they still need (while booking, or later
 *   from the booking). A listing made while booking is a DRAFT until the payment confirms the booking.
 * - Anyone signed in sees OPEN games (booking confirmed, start in the future, spots left), asks to join and
 *   chats with the organiser. Only the organiser and that player can read their chat.
 * - The organiser accepts or declines. Accepted players join the match squad; when every spot is taken the
 *   game is FILLED (and opens again if someone leaves). Cancelling the booking closes the game and tells everyone.
 * - Phone numbers are shown only to accepted players, and only for people who allowed it in their profile.
 */

export interface ListingInput {
  playersNeeded: number;
  note?: string | null;
  skillLevel?: string | null;
  /** paise; leave out for the suggested split */
  sharePerPlayer?: number | null;
}

const ACTIVE = ["DRAFT", "OPEN", "FILLED"];
export const MAX_GAME_MESSAGE = 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

type BookingForListing = Booking & { turf: { cityId: string }; config: { playersPerSide: number } };

function checkNeeded(n: number, playersPerSide: number) {
  const max = maxPlayersNeeded(playersPerSide);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new AppError(400, `Ask for 1 to ${max} players for a ${playersPerSide}-a-side game`);
}

const clean = (s: string | null | undefined, max: number) => (s ?? "").replace(/\r\n/g, "\n").trim().slice(0, max) || null;

/** Locks a game row for the rest of the transaction, so two accepts can't both take the last spot. */
async function lockPost(tx: Tx, postId: string) {
  await tx.$queryRaw`SELECT id FROM "PlayerPost" WHERE id = ${postId} FOR UPDATE`;
}

const acceptedCount = (tx: Tx, postId: string) => tx.playerPostRequest.count({ where: { postId, status: "ACCEPTED" } });

/** Creates the booking's listing, or updates it (one listing per booking that isn't closed). */
export async function listGame(db: Tx, booking: BookingForListing, input: ListingInput, status: "DRAFT" | "OPEN") {
  if (!booking.userId) throw new AppError(400, "Only bookings made in Turfly can be listed");
  checkNeeded(input.playersNeeded, booking.config.playersPerSide);
  const data = {
    playersNeeded: input.playersNeeded,
    note: clean(input.note, 300),
    skillLevel: clean(input.skillLevel, 30),
    sharePerPlayer: (input.sharePerPlayer ?? suggestShare(booking.totalPrice, booking.config.playersPerSide)) || null,
  };
  const existing = await db.playerPost.findFirst({ where: { bookingId: booking.id, status: { in: ACTIVE } } });
  if (existing) {
    const accepted = await acceptedCount(db, existing.id);
    if (input.playersNeeded < accepted) throw new AppError(400, `${accepted} players have already joined. Remove someone first.`);
    const next = existing.status === "DRAFT" && status === "DRAFT" ? "DRAFT" : accepted >= input.playersNeeded ? "FILLED" : "OPEN";
    return db.playerPost.update({ where: { id: existing.id }, data: { ...data, status: next } });
  }
  return db.playerPost.create({
    data: {
      ...data,
      userId: booking.userId,
      cityId: booking.turf.cityId,
      turfId: booking.turfId,
      bookingId: booking.id,
      playersPerSide: booking.config.playersPerSide,
      startAt: booking.startAt,
      status,
    },
  });
}

/** Lists the game of a confirmed booking (from the booking page). */
export async function listGameForBooking(user: User, bookingId: string, input: ListingInput) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { turf: true, config: true } });
  if (!b || b.userId !== user.id) throw new AppError(404, "Booking not found");
  if (b.status !== "CONFIRMED" || b.startAt <= new Date()) throw new AppError(400, "Only upcoming confirmed bookings can be listed");
  return listGame(prisma, b, input, "OPEN");
}

/** Payment confirmed the booking: its draft listing goes live. Idempotent. */
export async function openGamesForBooking(tx: Tx, bookingId: string) {
  const { count } = await tx.playerPost.updateMany({ where: { bookingId, status: "DRAFT" }, data: { status: "OPEN" } });
  if (!count) return;
  const post = await tx.playerPost.findFirst({ where: { bookingId, status: "OPEN" }, select: { id: true, userId: true, playersNeeded: true } });
  if (post)
    await createNotification(tx, {
      userId: post.userId,
      title: "Your game is listed",
      body: `Players can now ask to join (${post.playersNeeded} needed). We'll tell you when someone does.`,
      link: `/games/${post.id}`,
    });
}

/** The booking was cancelled: close its game and tell everyone who asked or joined. */
export async function closeGamesForBooking(db: Tx, bookingId: string) {
  const posts = await db.playerPost.findMany({
    where: { bookingId, status: { in: ACTIVE } },
    include: { turf: { select: { name: true } }, requests: { where: { status: { in: ["PENDING", "ACCEPTED"] } }, select: { userId: true } } },
  });
  for (const p of posts) {
    await db.playerPost.update({ where: { id: p.id }, data: { status: "CLOSED" } });
    for (const r of p.requests)
      await createNotification(db, {
        userId: r.userId,
        title: "Game cancelled",
        body: `The ${formatIst(p.startAt)} game${p.turf ? ` at ${p.turf.name}` : ""} was cancelled by the organiser or the turf.`,
        link: `/games/${p.id}`,
      });
  }
}

/** The turf moved the booking: move its game and tell the players who joined. */
export async function moveGamesForBooking(db: Tx, bookingId: string, startAt: Date) {
  const posts = await db.playerPost.findMany({ where: { bookingId, status: { in: ACTIVE } }, include: { requests: { where: { status: "ACCEPTED" }, select: { userId: true } } } });
  for (const p of posts) {
    await db.playerPost.update({ where: { id: p.id }, data: { startAt } });
    for (const r of p.requests)
      await createNotification(db, { userId: r.userId, title: "Game time changed", body: `New time: ${formatIst(startAt)}`, link: `/games/${p.id}` });
  }
}

// ───────────── Finding games ─────────────

export const gameCardInclude = {
  user: { select: { name: true } },
  turf: { select: { name: true, slug: true, city: { select: { name: true, slug: true } } } },
  booking: { select: { endAt: true, configId: true, config: { select: { name: true } } } },
  _count: { select: { requests: { where: { status: "ACCEPTED" } } } },
} satisfies Prisma.PlayerPostInclude;

/** Games others can still join: listing open, booking confirmed, not started yet. */
export function openGamesWhere(f: { town?: string; format?: number; turfId?: string; from?: Date; to?: Date } = {}): Prisma.PlayerPostWhereInput {
  return {
    status: "OPEN",
    startAt: { gt: f.from && f.from > new Date() ? f.from : new Date(), ...(f.to ? { lt: f.to } : {}) },
    booking: { status: "CONFIRMED" },
    ...(f.town ? { city: { slug: f.town } } : {}),
    ...(f.format ? { playersPerSide: f.format } : {}),
    ...(f.turfId ? { turfId: f.turfId } : {}),
  };
}

export async function findOpenGames(f: Parameters<typeof openGamesWhere>[0] & { take?: number } = {}) {
  const rows = await prisma.playerPost.findMany({ where: openGamesWhere(f), include: gameCardInclude, orderBy: { startAt: "asc" }, take: f.take ?? 50 });
  return rows.map((p) => ({ ...p, spots: spotsLeft(p.playersNeeded, p._count.requests) })).filter((p) => p.spots > 0);
}
export type GameCard = Awaited<ReturnType<typeof findOpenGames>>[number];

// ───────────── Asking to join, answering, leaving ─────────────

export async function requestToJoin(user: User, postId: string, rawMessage?: string | null) {
  const post = await prisma.playerPost.findUnique({ where: { id: postId }, include: { booking: { select: { status: true } }, turf: { select: { name: true } } } });
  if (!post || post.status === "DRAFT") throw new AppError(404, "Game not found");
  if (post.userId === user.id) throw new AppError(400, "This is your own game");
  if (post.status !== "OPEN" || post.startAt <= new Date() || post.booking?.status !== "CONFIRMED") throw new AppError(400, "This game isn't taking players any more");
  const message = clean(rawMessage, 300);
  const prev = await prisma.playerPostRequest.findUnique({ where: { postId_userId: { postId, userId: user.id } } });
  if (prev?.status === "ACCEPTED") throw new AppError(400, "You're already in this game");
  if (prev?.status === "DECLINED") throw new AppError(400, "The organiser couldn't fit you in this game");
  if (prev?.status === "PENDING") throw new AppError(400, "You've already asked. Send the organiser a message below.");
  if (message) await rateLimit(user.id);
  const req = await prisma.$transaction(async (tx) => {
    const r = prev
      ? await tx.playerPostRequest.update({ where: { id: prev.id }, data: { status: "PENDING", message, lastMessageAt: message ? new Date() : prev.lastMessageAt } })
      : await tx.playerPostRequest.create({ data: { postId, userId: user.id, message, lastMessageAt: message ? new Date() : null } });
    if (message) await tx.playerPostMessage.create({ data: { requestId: r.id, senderId: user.id, body: message } });
    await createNotification(tx, {
      userId: post.userId,
      title: `${displayName(user)} wants to join your game`,
      body: `${formatIst(post.startAt)}${post.turf ? ` · ${post.turf.name}` : ""}${message ? ` · “${message.slice(0, 80)}”` : ""}`,
      link: `/games/${post.id}?r=${r.id}`,
    });
    return r;
  });
  return req;
}

async function loadRequest(reqId: string) {
  const r = await prisma.playerPostRequest.findUnique({
    where: { id: reqId },
    include: { post: { include: { turf: { select: { name: true } } } }, user: { select: { id: true, name: true, phone: true, email: true } } },
  });
  if (!r) throw new AppError(404, "Request not found");
  return r;
}

/** The organiser accepts or declines a player. */
export async function respondToRequest(user: User, reqId: string, decision: "ACCEPTED" | "DECLINED") {
  const r = await loadRequest(reqId);
  if (r.post.userId !== user.id) throw new AppError(404, "Request not found");
  if (r.status !== "PENDING") throw new AppError(400, "You've already answered this request");
  if (r.post.startAt <= new Date()) throw new AppError(400, "This game has already started");
  await prisma.$transaction(async (tx) => {
    await lockPost(tx, r.postId);
    const post = await tx.playerPost.findUniqueOrThrow({ where: { id: r.postId } });
    if (decision === "ACCEPTED") {
      if (post.status === "CLOSED") throw new AppError(400, "This game is closed");
      const accepted = await acceptedCount(tx, post.id);
      if (accepted >= post.playersNeeded) throw new AppError(400, "All spots are taken. Add a spot first.");
      if (accepted + 1 >= post.playersNeeded) await tx.playerPost.update({ where: { id: post.id }, data: { status: "FILLED" } });
      if (post.bookingId) {
        const inSquad = await tx.matchPlayer.findFirst({ where: { bookingId: post.bookingId, userId: r.userId } });
        if (!inSquad) await tx.matchPlayer.create({ data: { bookingId: post.bookingId, userId: r.userId, name: r.user.name ?? "Player", status: "CONFIRMED" } });
      }
    }
    const { count } = await tx.playerPostRequest.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: decision } });
    if (count !== 1) throw new AppError(409, "This request was just updated");
    await createNotification(tx, {
      userId: r.userId,
      title: decision === "ACCEPTED" ? "You're in!" : "Not this time",
      body:
        decision === "ACCEPTED"
          ? `${displayName(user)} added you to the ${formatIst(post.startAt)} game${r.post.turf ? ` at ${r.post.turf.name}` : ""}.`
          : `${displayName(user)} couldn't fit you in this game. Try another open game.`,
      link: `/games/${post.id}`,
    });
  });
}

/** The player takes back their request, or leaves a game they joined. */
export async function withdrawRequest(user: User, reqId: string) {
  const r = await loadRequest(reqId);
  if (r.userId !== user.id) throw new AppError(404, "Request not found");
  if (r.status !== "PENDING" && r.status !== "ACCEPTED") throw new AppError(400, "Nothing to cancel");
  if (r.post.startAt <= new Date()) throw new AppError(400, "This game has already started");
  await prisma.$transaction(async (tx) => {
    await lockPost(tx, r.postId);
    const { count } = await tx.playerPostRequest.updateMany({ where: { id: r.id, status: r.status }, data: { status: "WITHDRAWN" } });
    if (count !== 1) throw new AppError(409, "This request was just updated");
    if (r.status === "ACCEPTED") {
      if (r.post.bookingId) await tx.matchPlayer.deleteMany({ where: { bookingId: r.post.bookingId, userId: user.id, teamMemberId: null } });
      await tx.playerPost.updateMany({ where: { id: r.postId, status: "FILLED" }, data: { status: "OPEN" } });
    }
    await createNotification(tx, {
      userId: r.post.userId,
      title: r.status === "ACCEPTED" ? `${displayName(user)} left your game` : `${displayName(user)} cancelled their request`,
      body: r.status === "ACCEPTED" ? "A spot is open again, so the game is back in the list." : formatIst(r.post.startAt),
      link: `/games/${r.postId}`,
    });
  });
}

/** Organiser edits the listing: spots, note, share; closes it to new players or opens it again. */
export async function updateGame(
  user: User,
  postId: string,
  patch: { playersNeeded?: number; note?: string | null; skillLevel?: string | null; sharePerPlayer?: number | null; action?: "close" | "reopen" },
) {
  const post = await prisma.playerPost.findUnique({ where: { id: postId }, include: { booking: { select: { status: true } } } });
  if (!post || post.userId !== user.id) throw new AppError(404, "Game not found");
  if (post.startAt <= new Date()) throw new AppError(400, "This game has already started");
  return prisma.$transaction(async (tx) => {
    await lockPost(tx, post.id);
    const accepted = await acceptedCount(tx, post.id);
    const needed = patch.playersNeeded ?? post.playersNeeded;
    if (patch.playersNeeded != null) {
      checkNeeded(patch.playersNeeded, post.playersPerSide);
      if (patch.playersNeeded < accepted) throw new AppError(400, `${accepted} players have already joined. Remove someone first.`);
    }
    let status = post.status;
    if (patch.action === "close") {
      status = "CLOSED";
      const pending = await tx.playerPostRequest.findMany({ where: { postId: post.id, status: "PENDING" }, select: { id: true, userId: true } });
      await tx.playerPostRequest.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: "DECLINED" } });
      for (const p of pending)
        await createNotification(tx, { userId: p.userId, title: "Game closed", body: `${displayName(user)} isn't taking more players for the ${formatIst(post.startAt)} game.`, link: `/games/${post.id}` });
    } else if (patch.action === "reopen" || post.status === "OPEN" || post.status === "FILLED") {
      if (post.booking?.status !== "CONFIRMED") throw new AppError(400, "The booking isn't confirmed");
      if (patch.action === "reopen" && post.status === "CLOSED") {
        const other = await tx.playerPost.findFirst({ where: { bookingId: post.bookingId, status: { in: ACTIVE }, id: { not: post.id } } });
        if (other) throw new AppError(400, "This booking already has an open game");
      }
      status = accepted >= needed ? "FILLED" : "OPEN";
    }
    return tx.playerPost.update({
      where: { id: post.id },
      data: {
        status,
        playersNeeded: needed,
        ...(patch.note !== undefined ? { note: clean(patch.note, 300) } : {}),
        ...(patch.skillLevel !== undefined ? { skillLevel: clean(patch.skillLevel, 30) } : {}),
        ...(patch.sharePerPlayer !== undefined ? { sharePerPlayer: patch.sharePerPlayer || null } : {}),
      },
    });
  });
}

// ───────────── Chat between the organiser and one player ─────────────

async function rateLimit(userId: string) {
  const recent = await prisma.playerPostMessage.count({ where: { senderId: userId, createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) } } });
  if (recent >= RATE_MAX) throw new AppError(429, "You're sending messages too quickly. Please wait a moment.");
}

async function loadThread(user: User, reqId: string) {
  const r = await loadRequest(reqId);
  const role = r.userId === user.id ? ("player" as const) : r.post.userId === user.id ? ("organiser" as const) : null;
  if (!role) throw new AppError(404, "Chat not found"); // nobody else can read it, admins included
  return { r, role };
}

export async function threadMessages(user: User, reqId: string, after?: Date) {
  const { r, role } = await loadThread(user, reqId);
  const rows = await prisma.playerPostMessage.findMany({
    where: { requestId: r.id, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { role, status: r.status, messages: rows.reverse().map((m) => ({ id: m.id, body: m.body, at: m.createdAt, mine: m.senderId === user.id })) };
}

export async function sendGameMessage(user: User, reqId: string, raw: string) {
  const { r, role } = await loadThread(user, reqId);
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (!body) throw new AppError(400, "Type a message");
  if (body.length > MAX_GAME_MESSAGE) throw new AppError(400, `Messages can be at most ${MAX_GAME_MESSAGE} characters`);
  if (r.post.startAt.getTime() < Date.now() - 24 * 3600_000) throw new AppError(400, "This game is over");
  await rateLimit(user.id);
  const recipientId = role === "player" ? r.post.userId : r.userId;
  const link = role === "player" ? `/games/${r.postId}?r=${r.id}` : `/games/${r.postId}`;
  const title = `${displayName(user)} · game chat`;
  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.playerPostMessage.create({ data: { requestId: r.id, senderId: user.id, body } });
    await tx.playerPostRequest.update({ where: { id: r.id }, data: { lastMessageAt: m.createdAt } });
    // One in-app notification per unread burst (as in turf chat); the phone push replaces the previous one.
    const pending = await tx.notification.findFirst({ where: { userId: recipientId, link, readAt: null } });
    if (!pending) await tx.notification.create({ data: { userId: recipientId, title, body: body.slice(0, 120), link } });
    return m;
  });
  queuePush(recipientId, { title, body: body.slice(0, 200), link, tag: `game-${r.id}` });
  return { id: msg.id, body: msg.body, at: msg.createdAt, mine: true };
}
