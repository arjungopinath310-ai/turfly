import type { User } from "@prisma/client";
import { prisma } from "./db";

/** Turfs the user can manage (admins: all). */
export function manageableTurfs(user: User) {
  return prisma.turf.findMany({
    where: user.role === "ADMIN" ? { status: { not: "UNCLAIMED" } } : { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, status: true, availabilityMode: true },
  });
}

export function pickTurf<T extends { id: string }>(turfs: T[], id?: string) {
  return turfs.find((t) => t.id === id) ?? turfs[0] ?? null;
}
