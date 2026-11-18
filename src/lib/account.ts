import type { User } from "@prisma/client";
import { prisma } from "./db";
import { AppError } from "./errors";

/**
 * Account deletion (Google Play + DPDP Act). Personal data is erased; booking and payment records are kept
 * (tax/accounting law) but no longer linked to a name, phone or email.
 * Blocked while the user has upcoming confirmed bookings or owns turfs, so nobody is left with a booking
 * they can't manage and no turf is orphaned.
 */
export async function deleteAccount(user: User) {
  const now = new Date();
  const [upcoming, turfs] = await Promise.all([
    prisma.booking.count({ where: { userId: user.id, status: "CONFIRMED", endAt: { gt: now } } }),
    prisma.turf.count({ where: { ownerId: user.id } }),
  ]);
  if (turfs) throw new AppError(400, "You manage a turf on Turfly. Contact support to transfer or close it before deleting your account.");
  if (upcoming) throw new AppError(400, `You have ${upcoming} upcoming booking${upcoming > 1 ? "s" : ""}. Cancel ${upcoming > 1 ? "them" : "it"} (or wait until after the match) before deleting your account.`);

  await prisma.$transaction(async (tx) => {
    // abandon any checkout in progress
    const held = await tx.booking.findMany({ where: { userId: user.id, status: "HELD" }, select: { id: true } });
    if (held.length) {
      await tx.booking.updateMany({ where: { id: { in: held.map((h) => h.id) } }, data: { status: "CANCELLED", cancelledAt: now, cancelReason: "Account deleted" } });
      await tx.occupancy.updateMany({ where: { bookingId: { in: held.map((h) => h.id) } }, data: { released: true } });
    }
    // own presence in teams and match squads
    await tx.teamMember.updateMany({ where: { userId: user.id }, data: { name: "Deleted player", phone: null, email: null, photoUrl: null, status: "REMOVED", isCaptain: false } });
    await tx.matchPlayer.updateMany({ where: { userId: user.id }, data: { name: "Deleted player" } });
    // teams the user created: archive them and erase the contact details they entered for other people
    const teams = await tx.team.findMany({ where: { ownerId: user.id }, select: { id: true } });
    if (teams.length) {
      const ids = teams.map((t) => t.id);
      await tx.team.updateMany({ where: { id: { in: ids } }, data: { archived: true, logoUrl: null } });
      await tx.teamMember.updateMany({ where: { teamId: { in: ids } }, data: { phone: null, email: null, photoUrl: null } });
    }
    await tx.playerPost.updateMany({ where: { userId: user.id, status: { in: ["DRAFT", "OPEN", "FILLED"] } }, data: { status: "CLOSED" } });
    await tx.playerPostRequest.updateMany({ where: { userId: user.id, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "WITHDRAWN" } });
    await tx.playerPostMessage.updateMany({ where: { senderId: user.id }, data: { body: "(message deleted)" } });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.deviceToken.deleteMany({ where: { userId: user.id } });
    if (user.phone) await tx.otpCode.deleteMany({ where: { phone: user.phone } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: "Deleted user",
        phone: null,
        email: null,
        image: null,
        preferredPosition: null,
        shareContactWithTeams: false,
        referralCode: null,
        isSuspended: true, // ends every session immediately
        deletedAt: now,
      },
    });
    await tx.auditLog.create({ data: { actorId: user.id, action: "ACCOUNT_DELETED", entity: "User", entityId: user.id } });
  });
}

/** Everything we hold about the user, as JSON (DPDP Act right of access). */
export async function exportAccount(user: User) {
  const [bookings, teams, memberships, reviews, conversations, notifications, posts, gameMessages] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: user.id },
      include: { turf: { select: { name: true } }, config: { select: { name: true } }, payments: { include: { refunds: true } }, roster: true },
      orderBy: { startAt: "desc" },
    }),
    prisma.team.findMany({ where: { ownerId: user.id }, include: { members: true, history: true } }),
    prisma.teamMember.findMany({ where: { userId: user.id }, include: { team: { select: { name: true } } } }),
    prisma.review.findMany({ where: { userId: user.id }, include: { turf: { select: { name: true } } } }),
    prisma.conversation.findMany({ where: { playerId: user.id }, include: { turf: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" } } } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.playerPost.findMany({ where: { userId: user.id }, include: { requests: true } }),
    prisma.playerPostMessage.findMany({ where: { senderId: user.id }, select: { body: true, createdAt: true, requestId: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const { id, phone, email, name, preferredPosition, shareContactWithTeams, referralCode, role, createdAt } = user;
  return {
    exportedAt: new Date().toISOString(),
    profile: { id, phone, email, name, preferredPosition, shareContactWithTeams, referralCode, role, createdAt },
    bookings,
    teamsYouCreated: teams,
    teamMemberships: memberships,
    reviews,
    conversations: conversations.map((c) => ({ turf: c.turf.name, messages: c.messages.map((m) => ({ fromYou: m.senderId === user.id, body: m.body, at: m.createdAt })) })),
    notifications,
    playerPosts: posts,
    gameChatMessagesYouSent: gameMessages,
  };
}
