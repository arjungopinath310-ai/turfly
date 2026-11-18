import type { User } from "@prisma/client";
import { prisma } from "./db";
import { ensureSandbox } from "./showcase";

/**
 * Turfs the user can manage (admins: all, except other people's private sample copies).
 * Demo mode: someone who owns no turf yet first gets a private copy of the sample turf to try the owner side.
 */
export async function manageableTurfs(user: User) {
  if (user.role !== "ADMIN") await ensureSandbox(user).catch((e) => console.error("[sandbox] could not prepare a sample turf", e));
  return prisma.turf.findMany({
    where: user.role === "ADMIN" ? { status: { not: "UNCLAIMED" }, OR: [{ isSandbox: false }, { ownerId: user.id }] } : { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, status: true, availabilityMode: true, isSandbox: true, isDemo: true, freeUntil: true },
  });
}

export function pickTurf<T extends { id: string }>(turfs: T[], id?: string) {
  return turfs.find((t) => t.id === id) ?? turfs[0] ?? null;
}
