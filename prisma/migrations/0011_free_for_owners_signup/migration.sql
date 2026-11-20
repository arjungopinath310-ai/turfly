-- Turfly is free for players and turf owners; the only charge is the booking fee a player pays online.
-- Record when each person accepted the terms (the sign-up page, or the first sign-in which says so).
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
-- Everyone who already has an account signed in under the same notice.
UPDATE "User" SET "termsAcceptedAt" = "createdAt" WHERE "termsAcceptedAt" IS NULL AND "deletedAt" IS NULL;

-- The owner free period and monthly fee are gone.
ALTER TABLE "Turf" DROP COLUMN "freeUntil";

-- Settings from the earlier money models; the booking fee (bookingFeePaise) replaces them.
DELETE FROM "PlatformSetting" WHERE "key" IN ('advanceAmountPaise', 'platformFeePaise', 'defaultCommissionPercent', 'freeTrialDays', 'onlineBookingFeePaise', 'monthlyFeeCapPaise');
