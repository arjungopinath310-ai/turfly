/**
 * Sales specimen: one fully set-up turf with two months of realistic activity, to show prospective turf owners
 * what Turfly looks like when a turf runs on it (dashboard, calendar, bookings, analytics, reviews, live slots).
 *
 *   npx tsx scripts/seed-showcase.ts --dry-run   (prints what it would create)
 *   npx tsx scripts/seed-showcase.ts             (writes to DATABASE_URL; take a backup first)
 *
 * It is clearly labelled: isDemo = true ("Demo listing" badge), "(Sample)" in the name, sample address and description.
 * Owner login: the demo owner +91 9000000001 (sign in with the demo code while DEMO_OTP is on).
 * Safe to run again: it deletes only this turf (slug turfly-showcase-arena) and everything attached to it, then
 * rebuilds it, so the history always ends "today". Real turfs and real users are never touched; the sample
 * players use the reserved +91 90000001xx numbers.
 * Between rebuilds the cron loop keeps it current (new days, open games): see src/lib/showcase.ts.
 */
import { prisma } from "../src/lib/db";
import {
  DAYS_AHEAD,
  DAYS_BACK,
  SHOWCASE_OWNER_PHONE,
  SHOWCASE_SLUG as SLUG,
  addShowcaseReviews,
  ensureSamplePlayers,
  ensureShowcaseChats,
  ensureShowcaseGames,
  generateShowcaseDay,
  loadShowcase,
  setupShowcaseTurf,
  type DayResult,
} from "../src/lib/showcase";
import { addDays, istToUtc, todayIst } from "../src/lib/time";
import { randomBytes } from "node:crypto";

const dryRun = process.argv.includes("--dry-run");

async function removeExisting() {
  const t = await prisma.turf.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!t) return 0;
  const bookings = await prisma.booking.findMany({ where: { turfId: t.id }, select: { id: true, code: true } });
  const B = bookings.map((b) => b.id);
  const P = (await prisma.payment.findMany({ where: { bookingId: { in: B } }, select: { id: true } })).map((p) => p.id);
  await prisma.$transaction([
    prisma.refund.deleteMany({ where: { paymentId: { in: P } } }),
    prisma.ledgerEntry.deleteMany({ where: { turfId: t.id } }),
    prisma.payment.deleteMany({ where: { id: { in: P } } }),
    prisma.review.deleteMany({ where: { turfId: t.id } }),
    prisma.dispute.deleteMany({ where: { bookingId: { in: B } } }),
    prisma.playerPost.deleteMany({ where: { OR: [{ turfId: t.id }, { bookingId: { in: B } }] } }),
    prisma.conversation.deleteMany({ where: { turfId: t.id } }),
    prisma.notification.deleteMany({ where: { OR: [{ link: { contains: SLUG } }, ...bookings.map((b) => ({ link: { contains: b.id } }))] } }),
    prisma.booking.deleteMany({ where: { id: { in: B } } }),
    prisma.slotBlock.deleteMany({ where: { turfId: t.id } }),
    prisma.turfClaim.deleteMany({ where: { turfId: t.id } }),
    prisma.turf.delete({ where: { id: t.id } }),
  ]);
  return bookings.length;
}

async function main() {
  const manjeri = await prisma.city.findUniqueOrThrow({ where: { slug: "manjeri" } });
  const today = todayIst();
  const days = Array.from({ length: DAYS_BACK + DAYS_AHEAD + 1 }, (_, i) => addDays(today, i - DAYS_BACK));
  const blockDay = addDays(today, 4); // planned maintenance 6-8 AM
  if (dryRun) {
    console.log(`Dry run: would (re)create "${SLUG}" with ${days.length} days of activity (${days[0]} … ${days[days.length - 1]}), 10 sample players, reviews, open games and a maintenance block.`);
    await prisma.$disconnect();
    return;
  }

  const removed = await removeExisting();
  if (removed) console.log(`Removed the previous sample turf and its ${removed} bookings.`);

  const owner = await prisma.user.upsert({
    where: { phone: SHOWCASE_OWNER_PHONE },
    update: { role: "OWNER", name: "Demo Owner" },
    create: { phone: SHOWCASE_OWNER_PHONE, name: "Demo Owner", role: "OWNER", referralCode: randomBytes(9).toString("base64url").slice(0, 6) },
  });
  await ensureSamplePlayers();

  // ── The turf, set up the way a model owner would ──
  const { turf, unitIds } = await setupShowcaseTurf(prisma, {
    slug: SLUG,
    name: "Turfly Showcase Arena (Sample)",
    description:
      "Sample turf: this is what a fully set-up Turfly listing looks like. One 7-a-side pitch that splits into two 5-a-side pitches, live free slots, online booking with a ₹49 advance, peak and early-bird prices, floodlights till 1 AM and verified reviews. Not a real ground.",
    ownerId: owner.id,
    cityId: manjeri.id,
    isSandbox: false,
    phone: SHOWCASE_OWNER_PHONE,
    createdAt: istToUtc(addDays(today, -DAYS_BACK - 14), 600),
  });

  // ── The maintenance block first, so no bookings are generated inside it ──
  const block = await prisma.slotBlock.create({
    data: { turfId: turf.id, configId: null, startAt: istToUtc(blockDay, 6 * 60), endAt: istToUtc(blockDay, 8 * 60), reason: "MAINTENANCE", note: "Turf brushing and line marking", createdById: owner.id },
  });
  await prisma.occupancy.createMany({ data: unitIds.map((unitId) => ({ unitId, blockId: block.id, startAt: block.startAt, endAt: block.endAt })) });

  // ── Two months of bookings, busiest in the evenings and weekends, growing week by week ──
  const ctx = (await loadShowcase())!;
  let bookings = 0;
  const reviewQueue: DayResult["reviews"] = [];
  for (const [di, day] of days.entries()) {
    const r = await generateShowcaseDay(ctx, day, { growth: 0.7 + 0.3 * (di / days.length) });
    bookings += r.created;
    reviewQueue.push(...r.reviews);
  }
  const reviews = await addShowcaseReviews(ctx, reviewQueue);
  const games = await ensureShowcaseGames(ctx);
  await ensureShowcaseChats(ctx);
  const agg = await prisma.turf.findUniqueOrThrow({ where: { id: turf.id }, select: { ratingAvg: true } });

  // ── The owner's latest notifications, as after real bookings ──
  const latest = await prisma.booking.findMany({ where: { turfId: turf.id, source: "ONLINE", status: "CONFIRMED" }, orderBy: { createdAt: "desc" }, take: 3 });
  for (const b of latest)
    await prisma.notification.create({ data: { userId: owner.id, title: `New booking ${b.code}`, body: turf.name, link: `/owner/bookings?focus=${b.id}`, createdAt: b.createdAt } });

  console.log(`Created ${turf.name}: ${bookings} bookings, ${reviews} reviews (rating ${agg.ratingAvg.toFixed(1)}), ${games} open games.`);
  console.log(`Owner login: +91 90000 00001. Turf page: /turfs/${SLUG}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
