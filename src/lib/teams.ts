import type { TeamMember, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { AppError } from "./errors";
import { token } from "./ids";
import { normalizePhone } from "./otp";

export const memberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  phone: z.string().max(16).optional().nullable(),
  email: z.string().email().max(120).optional().nullable().or(z.literal("")),
  position: z.string().max(30).optional().nullable(),
  jerseyNumber: z.coerce.number().int().min(0).max(999).optional().nullable(),
  photoUrl: z.string().max(200_000).optional().nullable(),
  isCaptain: z.boolean().optional(),
});

export function cleanMember(input: z.infer<typeof memberSchema>) {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw new AppError(400, "Invalid mobile number");
  if (input.photoUrl && !/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(input.photoUrl)) throw new AppError(400, "Invalid photo");
  return { ...input, phone, email: input.email || null };
}

export async function createTeam(user: User, data: { name: string; playersPerSide: number; logoUrl?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: { name: data.name, playersPerSide: data.playersPerSide, logoUrl: data.logoUrl, ownerId: user.id, inviteToken: token(12) },
    });
    // organiser is the first member and default captain
    await tx.teamMember.create({
      data: { teamId: team.id, userId: user.id, name: user.name ?? "Me", phone: user.phone, email: user.email, position: user.preferredPosition, isCaptain: true, status: "ACTIVE" },
    });
    await tx.teamEvent.create({ data: { teamId: team.id, type: "CREATED", detail: `Team "${team.name}" created` } });
    return team;
  });
}

export async function requireTeamOwner(userId: string, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.ownerId !== userId) throw new AppError(404, "Team not found");
  return team;
}

/**
 * Privacy: phone/email are shown only to the team owner (who entered them),
 * or to other members when that member has opted in (shareContactWithTeams).
 */
export function publicMember(m: TeamMember & { user?: { shareContactWithTeams: boolean } | null }, viewerIsOwner: boolean, viewerId?: string) {
  const consent = Boolean(m.user?.shareContactWithTeams);
  const canSee = viewerIsOwner || consent || (viewerId && m.userId === viewerId);
  return {
    id: m.id,
    name: m.name,
    position: m.position,
    jerseyNumber: m.jerseyNumber,
    photoUrl: m.photoUrl,
    isCaptain: m.isCaptain,
    status: m.status,
    registered: Boolean(m.userId),
    phone: canSee ? m.phone : m.phone ? "Hidden" : null,
    email: canSee ? m.email : null,
  };
}
