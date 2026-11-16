import type { User } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";
import { displayName } from "./format";

/**
 * Player ↔ turf chat.
 * - One conversation per (turf, player). Only the player and the turf's owner can read or reply (not admins).
 * - Players can start a chat with any approved turf that has an owner.
 * - Owners can only start a chat with players who have booked their turf (no cold messaging).
 * - Phone numbers are never shown; people see names only.
 */

export const MAX_MESSAGE = 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

export type ChatRole = "player" | "owner";

export async function loadConversationFor(user: User, conversationId: string) {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { turf: { select: { id: true, name: true, slug: true, ownerId: true } }, player: { select: { id: true, name: true, phone: true, email: true } } },
  });
  if (!c) throw new AppError(404, "Conversation not found");
  const role: ChatRole | null = c.playerId === user.id ? "player" : c.turf.ownerId === user.id ? "owner" : null;
  if (!role) throw new AppError(404, "Conversation not found");
  return { c, role };
}

function cleanBody(raw: string) {
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (!body) throw new AppError(400, "Type a message");
  if (body.length > MAX_MESSAGE) throw new AppError(400, `Messages can be at most ${MAX_MESSAGE} characters`);
  return body;
}

async function rateLimit(userId: string) {
  const recent = await prisma.message.count({ where: { senderId: userId, createdAt: { gt: new Date(Date.now() - RATE_WINDOW_MS) } } });
  if (recent >= RATE_MAX) throw new AppError(429, "You're sending messages too quickly. Please wait a moment.");
}

/** Player opens (or reuses) a chat with a turf. */
export async function startAsPlayer(user: User, turfId: string, bookingId?: string | null) {
  const turf = await prisma.turf.findUnique({ where: { id: turfId }, select: { id: true, status: true, ownerId: true } });
  if (!turf || turf.status !== "APPROVED") throw new AppError(400, "This turf isn't on Turfly yet. Please call them instead.");
  if (!turf.ownerId) throw new AppError(400, "This turf hasn't been claimed by its owner yet. Please call them instead.");
  if (turf.ownerId === user.id) throw new AppError(400, "You manage this turf, so open your inbox to reply to players.");
  if (bookingId) {
    const b = await prisma.booking.findFirst({ where: { id: bookingId, userId: user.id, turfId } });
    if (!b) bookingId = null;
  }
  return prisma.conversation.upsert({
    where: { turfId_playerId: { turfId, playerId: user.id } },
    create: { turfId, playerId: user.id, bookingId: bookingId ?? null },
    update: bookingId ? { bookingId } : {},
  });
}

/** Owner opens (or reuses) a chat with a player who has booked this turf. */
export async function startAsOwner(user: User, turfId: string, playerId: string, bookingId?: string | null) {
  const turf = await prisma.turf.findUnique({ where: { id: turfId }, select: { ownerId: true } });
  if (!turf || turf.ownerId !== user.id) throw new AppError(403, "Only the turf's owner can message its customers");
  const booked = await prisma.booking.findFirst({ where: { turfId, userId: playerId, ...(bookingId ? { id: bookingId } : {}) }, select: { id: true } });
  if (!booked) throw new AppError(400, "You can only message players who have booked this turf");
  return prisma.conversation.upsert({
    where: { turfId_playerId: { turfId, playerId } },
    create: { turfId, playerId, bookingId: booked.id },
    update: {},
  });
}

export async function sendMessage(user: User, conversationId: string, raw: string) {
  const { c, role } = await loadConversationFor(user, conversationId);
  const body = cleanBody(raw);
  await rateLimit(user.id);
  const now = new Date();
  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({ data: { conversationId: c.id, senderId: user.id, body } });
    await tx.conversation.update({
      where: { id: c.id },
      data: {
        lastMessageAt: now,
        lastMessageText: body.slice(0, 140),
        lastSenderId: user.id,
        ...(role === "player" ? { playerLastReadAt: now } : { ownerLastReadAt: now }),
      },
    });
    // One in-app notification per unread burst: skip if the recipient already has an unread one for this chat.
    const recipientId = role === "player" ? c.turf.ownerId : c.playerId;
    if (recipientId && recipientId !== user.id) {
      const link = `/messages?c=${c.id}`;
      const pending = await tx.notification.findFirst({ where: { userId: recipientId, link, readAt: null } });
      if (!pending)
        await tx.notification.create({
          data: { userId: recipientId, title: role === "player" ? `New message from ${displayName(user)} · ${c.turf.name}` : `${c.turf.name} replied`, body: body.slice(0, 120), link },
        });
    }
    return m;
  });
  return msg;
}

export async function markRead(user: User, conversationId: string) {
  const { c, role } = await loadConversationFor(user, conversationId);
  const now = new Date();
  await prisma.conversation.update({ where: { id: c.id }, data: role === "player" ? { playerLastReadAt: now } : { ownerLastReadAt: now } });
  await prisma.notification.updateMany({ where: { userId: user.id, link: `/messages?c=${c.id}`, readAt: null }, data: { readAt: now } });
}

/** All conversations the user takes part in, as player or as turf owner, newest first. */
export async function listConversations(user: User) {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ playerId: user.id }, { turf: { ownerId: user.id } }], messages: { some: {} } },
    include: { turf: { select: { id: true, name: true, slug: true, ownerId: true } }, player: { select: { id: true, name: true, phone: true, email: true } } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  return Promise.all(
    rows.map(async (c) => {
      const role: ChatRole = c.playerId === user.id ? "player" : "owner";
      const lastRead = role === "player" ? c.playerLastReadAt : c.ownerLastReadAt;
      const unread = await prisma.message.count({ where: { conversationId: c.id, senderId: { not: user.id }, createdAt: { gt: lastRead } } });
      return {
        id: c.id,
        role,
        title: role === "player" ? c.turf.name : displayName(c.player),
        subtitle: role === "player" ? "Turf" : `Player · ${c.turf.name}`,
        turfSlug: c.turf.slug,
        lastMessageAt: c.lastMessageAt.toISOString(),
        lastMessageText: c.lastMessageText,
        lastFromMe: c.lastSenderId === user.id,
        unread,
      };
    }),
  );
}

export async function unreadMessageCount(userId: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    JOIN "Turf" t ON t.id = c."turfId"
    WHERE m."senderId" <> ${userId}
      AND ((c."playerId" = ${userId} AND m."createdAt" > c."playerLastReadAt")
        OR (t."ownerId" = ${userId} AND m."createdAt" > c."ownerLastReadAt"))`;
  return Number(rows[0]?.n ?? 0);
}

export async function threadMessages(user: User, conversationId: string, after?: Date) {
  const { c, role } = await loadConversationFor(user, conversationId);
  const messages = await prisma.message.findMany({
    where: { conversationId: c.id, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: after ? 200 : 100,
    include: { sender: { select: { id: true, name: true, phone: true, email: true } } },
  });
  if (!after) messages.reverse();
  const booking = c.bookingId
    ? await prisma.booking.findUnique({ where: { id: c.bookingId }, select: { id: true, code: true, startAt: true, endAt: true, status: true } })
    : null;
  return {
    conversation: {
      id: c.id,
      role,
      title: role === "player" ? c.turf.name : displayName(c.player),
      turf: { name: c.turf.name, slug: c.turf.slug },
      booking: booking && { ...booking, startAt: booking.startAt.toISOString(), endAt: booking.endAt.toISOString() },
      otherLastReadAt: (role === "player" ? c.ownerLastReadAt : c.playerLastReadAt).toISOString(),
    },
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.senderId === user.id,
      // players see the turf name for owner messages; owners see the player's name
      senderLabel: m.senderId === user.id ? "You" : role === "player" ? c.turf.name : displayName(m.sender),
    })),
  };
}
