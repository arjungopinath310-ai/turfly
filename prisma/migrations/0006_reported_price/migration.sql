-- Reported (not owner-set) hourly price for turfs that don't manage bookings on Turfly
ALTER TABLE "Turf" ADD COLUMN     "reportedPriceFrom" INTEGER;
ALTER TABLE "Turf" ADD COLUMN     "reportedPriceNote" TEXT;
ALTER TABLE "Turf" ADD COLUMN     "reportedPriceAt" TIMESTAMP(3);
