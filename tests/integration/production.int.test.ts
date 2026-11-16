/**
 * Integration tests (real PostgreSQL) for production hardening:
 * SMS-pumping limits, account deletion & export, push-token ownership.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requestOtp } from "@/lib/otp";
import { deleteAccount, exportAccount } from "@/lib/account";
import { createTeam } from "@/lib/teams";
import { addDays, todayIst } from "@/lib/time";

const tag = randomBytes(3).toString("hex");
let n = 0;
const phone = () => `98${String(Date.now()).slice(-4)}${String(n++).padStart(4, "0")}`;
const mkUser = (data: Partial<User> = {}) => prisma.user.create({ data: { phone: `+91${phone()}`, name: `P${n}-${tag}`, ...data } });

beforeAll(() => {
  process.env.OTP_DEV_ECHO = "true";
});

describe("SMS-pumping protection", () => {
  it("limits OTP requests per IP address", async () => {
    const ip = `203.0.113.${(Date.now() % 200) + 1}-${tag}`;
    for (let i = 0; i < 10; i++) await requestOtp(phone(), ip);
    await expect(requestOtp(phone(), ip)).rejects.toMatchObject({ status: 429 });
    await expect(requestOtp(phone(), `${ip}-other`)).resolves.toBeTruthy(); // a different network is fine
  });
  it("stops all OTPs when the platform-wide hourly ceiling is reached", async () => {
    const before = process.env.OTP_GLOBAL_PER_HOUR;
    process.env.OTP_GLOBAL_PER_HOUR = String(await prisma.otpCode.count({ where: { createdAt: { gt: new Date(Date.now() - 3_600_000) } } }));
    try {
      await expect(requestOtp(phone(), "198.51.100.7")).rejects.toMatchObject({ status: 503 });
    } finally {
      process.env.OTP_GLOBAL_PER_HOUR = before;
    }
  });
});

describe("account deletion & export", () => {
  it("exports the user's data", async () => {
    const u = await mkUser({ email: `${tag}@example.com` });
    const team = await createTeam(u, { name: `Export FC ${tag}`, playersPerSide: 5 });
    const data = await exportAccount(u);
    expect(data.profile).toMatchObject({ id: u.id, phone: u.phone, email: `${tag}@example.com` });
    expect(data.teamsYouCreated.map((t) => t.id)).toContain(team.id);
  });

  it("erases personal data, archives own teams, removes devices, keeps booking records", async () => {
    const u = await mkUser({ email: `del-${tag}@example.com` });
    const team = await createTeam(u, { name: `Gone FC ${tag}`, playersPerSide: 5 });
    await prisma.teamMember.create({ data: { teamId: team.id, name: "Friend", phone: "+919811111111", email: "friend@example.com" } });
    await prisma.deviceToken.create({ data: { userId: u.id, token: `tok-${tag}-${"x".repeat(30)}`, platform: "android" } });
    await prisma.notification.create({ data: { userId: u.id, title: "t", body: "b" } });
    await deleteAccount(u);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ name: "Deleted user", phone: null, email: null, isSuspended: true });
    expect(after.deletedAt).toBeInstanceOf(Date);
    expect(await prisma.deviceToken.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: u.id } })).toBe(0);
    const members = await prisma.teamMember.findMany({ where: { teamId: team.id } });
    expect(members.every((m) => m.phone === null && m.email === null)).toBe(true);
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).archived).toBe(true);
    // the same phone number can sign up again as a fresh account
    expect(await prisma.user.count({ where: { phone: u.phone } })).toBe(0);
  });

  it("refuses while the user has an upcoming confirmed booking or owns a turf", async () => {
    const u = await mkUser();
    const city = await prisma.city.upsert({ where: { slug: "it-city" }, update: {}, create: { slug: "it-city", name: "IT City", state: "KL", lat: 11, lng: 76, pincodes: [] } });
    const turf = await prisma.turf.create({ data: { slug: `prod-${tag}`, name: "Prod Turf", cityId: city.id, addressLine: "x", pincode: "676121", lat: 11, lng: 76 } });
    const unit = await prisma.resourceUnit.create({ data: { turfId: turf.id, name: "Main" } });
    const cfg = await prisma.pitchConfig.create({ data: { turfId: turf.id, name: "5s", playersPerSide: 5, basePricePerHour: 100000, units: { create: [{ unitId: unit.id }] } } });
    const start = new Date(`${addDays(todayIst(), 2)}T13:30:00Z`);
    await prisma.booking.create({
      data: { code: `TF-${tag.toUpperCase()}`, turfId: turf.id, configId: cfg.id, userId: u.id, status: "CONFIRMED", startAt: start, endAt: new Date(start.getTime() + 3_600_000), durationMinutes: 60, totalPrice: 100000, advanceAmount: 4900, onlineAmount: 4900, balanceDue: 95100, policySnapshot: {} },
    });
    await expect(deleteAccount(u)).rejects.toThrow(/upcoming booking/);
    const owner = await mkUser();
    await prisma.turf.update({ where: { id: turf.id }, data: { ownerId: owner.id } });
    await expect(deleteAccount(owner)).rejects.toThrow(/manage a turf/);
  });
});

describe("push tokens", () => {
  it("a token belongs to whoever signed in last on that device", async () => {
    const [a, b] = [await mkUser(), await mkUser()];
    const token = `shared-${tag}-${"y".repeat(30)}`;
    await prisma.deviceToken.upsert({ where: { token }, create: { token, platform: "android", userId: a.id }, update: { userId: a.id } });
    await prisma.deviceToken.upsert({ where: { token }, create: { token, platform: "android", userId: b.id }, update: { userId: b.id } });
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token } })).userId).toBe(b.id);
    expect(await prisma.deviceToken.count({ where: { token } })).toBe(1);
  });
});
