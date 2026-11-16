/**
 * Seed: cities, an admin, a demo owner and CLEARLY-LABELLED DEMO turfs (isDemo = true).
 * No real Manjeri business is represented here. Add real turfs as unclaimed listings from the
 * admin dashboard using public information, or let owners register.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { convertiblePitchLayout, singlePitchLayout, type Layout } from "../src/lib/engine/allocation";

const prisma = new PrismaClient();
const tok = () => randomBytes(12).toString("base64url");

async function layout(turfId: string, l: Layout, peakPaise?: Record<string, number>) {
  const ids: Record<string, string> = {};
  for (const [i, u] of l.units.entries()) ids[u.key] = (await prisma.resourceUnit.create({ data: { turfId, name: u.name, isVirtual: Boolean(u.isVirtual), sortOrder: i } })).id;
  for (const [i, c] of l.configs.entries()) {
    const cfg = await prisma.pitchConfig.create({
      data: { turfId, name: c.name, playersPerSide: c.playersPerSide, basePricePerHour: c.basePricePerHour, sortOrder: i, units: { create: c.unitKeys.map((k) => ({ unitId: ids[k] })) } },
    });
    const peak = peakPaise?.[c.playersPerSide];
    if (peak) await prisma.pricingRule.create({ data: { configId: cfg.id, label: "Peak evening", weekdays: [], startMinute: 18 * 60, endMinute: 23 * 60, pricePerHour: peak, priority: 1 } });
  }
}

const hours = (turfId: string, open = 360, close = 1500) =>
  prisma.operatingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ turfId, weekday, openMinute: open, closeMinute: close })) });

async function main() {
  const manjeri = await prisma.city.upsert({
    where: { slug: "manjeri" },
    update: {},
    create: { slug: "manjeri", name: "Manjeri", district: "Malappuram", state: "Kerala", lat: 11.1203, lng: 76.1199, pincodes: ["676121", "676122", "676123"] },
  });
  await prisma.city.upsert({
    where: { slug: "malappuram" },
    update: {},
    create: { slug: "malappuram", name: "Malappuram", district: "Malappuram", state: "Kerala", lat: 11.051, lng: 76.0711, pincodes: ["676505", "676519"] },
  });

  const adminPhone = (process.env.ADMIN_PHONES ?? "+919999999999").split(",")[0].trim();
  await prisma.user.upsert({ where: { phone: adminPhone }, update: { role: "ADMIN" }, create: { phone: adminPhone, name: "Platform Admin", role: "ADMIN", referralCode: tok().slice(0, 6) } });

  // Production: SEED_DEMO=false creates only cities and the admin, with no fictional turfs or demo accounts.
  if (process.env.SEED_DEMO === "false") {
    console.log(`Seeded cities and admin ${adminPhone}. Demo data skipped (SEED_DEMO=false).`);
    return;
  }
  const owner = await prisma.user.upsert({ where: { phone: "+919000000001" }, update: {}, create: { phone: "+919000000001", name: "Demo Owner", role: "OWNER", referralCode: tok().slice(0, 6) } });
  await prisma.user.upsert({ where: { phone: "+919000000002" }, update: {}, create: { phone: "+919000000002", name: "Demo Player", referralCode: tok().slice(0, 6) } });

  if (await prisma.turf.count({ where: { isDemo: true } })) {
    console.log("Demo turfs already seeded, skipping.");
    return;
  }

  const base = { cityId: manjeri.id, isDemo: true, status: "APPROVED" as const, ownerId: owner.id, amenities: ["parking", "washroom", "drinking_water", "floodlights", "changing_room"] };

  // 1. The convertible facility: one 7-a-side that splits into two independent 5-a-side pitches.
  const arena = await prisma.turf.create({
    data: {
      ...base,
      slug: "demo-convertible-arena",
      name: "Demo Convertible Arena",
      description: "Demo listing. One 7-a-side pitch that splits into two independent 5-a-side pitches. Book the full pitch, or either half.",
      addressLine: "Near Bus Stand Road (demo address)",
      locality: "Manjeri Town",
      pincode: "676121",
      lat: 11.1211,
      lng: 76.1215,
      phone: "+919000000001",
      availabilityMode: "LIVE",
      availabilityUpdatedAt: new Date(),
      isFeatured: true,
      amenities: [...base.amenities, "seating", "cafe"],
      photos: ["https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=1200&q=70"],
    },
  });
  await hours(arena.id);
  await layout(arena.id, convertiblePitchLayout({ halvesSimultaneous: true, allowCombined: true, fullPricePerHour: 150000, halfPricePerHour: 90000 }), { 7: 180000, 5: 110000 });

  // 2. Simple single 5-a-side, live
  const five = await prisma.turf.create({
    data: {
      ...base,
      slug: "demo-kickoff-fives",
      name: "Demo Kickoff Fives",
      description: "Demo listing. Compact 5-a-side cage with floodlights.",
      addressLine: "Calicut Road (demo address)",
      locality: "Kacheripady",
      pincode: "676121",
      lat: 11.1162,
      lng: 76.1158,
      availabilityMode: "LIVE",
      availabilityUpdatedAt: new Date(),
      photos: ["https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=1200&q=70"],
    },
  });
  await hours(five.id, 360, 1440);
  await layout(five.id, singlePitchLayout(5, 80000), { 5: 100000 });

  // 3. Owner-reported 7-a-side (shows grid but not bookable online)
  const reported = await prisma.turf.create({
    data: {
      ...base,
      slug: "demo-greenfield-sevens",
      name: "Demo Greenfield Sevens",
      description: "Demo listing. Availability is updated by the owner manually, so call to confirm.",
      addressLine: "Pandikkad Road (demo address)",
      locality: "Pandikkad Road",
      pincode: "676122",
      lat: 11.1268,
      lng: 76.1302,
      availabilityMode: "OWNER_REPORTED",
      availabilityUpdatedAt: new Date(Date.now() - 3 * 3600_000),
      phone: "+919000000001",
    },
  });
  await hours(reported.id);
  await layout(reported.id, singlePitchLayout(7, 140000));

  // 4. Unclaimed listing (no availability, call only), with a claim link
  await prisma.turf.create({
    data: {
      cityId: manjeri.id,
      isDemo: true,
      slug: "demo-unclaimed-turf",
      name: "Demo Unclaimed Turf",
      addressLine: "Thurakkal (demo address)",
      locality: "Thurakkal",
      pincode: "676123",
      lat: 11.1102,
      lng: 76.1279,
      status: "UNCLAIMED",
      availabilityMode: "NONE",
      claimToken: tok(),
      sourceNote: "Demo data, not a real business",
      amenities: ["parking", "floodlights"],
    },
  });

  await prisma.offer.upsert({
    where: { code: "WELCOME50" },
    update: {},
    create: { code: "WELCOME50", title: "₹50 off your first booking (at venue)", kind: "FIRST_BOOKING", discountType: "FLAT", value: 5000 },
  });

  console.log(`Seeded. Admin: ${adminPhone} · Demo owner: +919000000001 · Demo player: +919000000002 (sign in with OTP; dev OTP shown on screen).`);
}

main().finally(() => prisma.$disconnect());
