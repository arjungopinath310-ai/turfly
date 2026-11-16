-- Database-level double-booking guarantee.
-- Two non-released occupancy rows on the same resource unit may never overlap in time.
-- '[)' = half-open ranges, so 18:00–19:00 and 19:00–20:00 do NOT conflict.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Occupancy"
  ADD CONSTRAINT occupancy_no_overlap
  EXCLUDE USING gist ("unitId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&)
  WHERE (released = false);

ALTER TABLE "Occupancy" ADD CONSTRAINT occupancy_valid_range CHECK ("endAt" > "startAt");
ALTER TABLE "Occupancy" ADD CONSTRAINT occupancy_one_owner CHECK (("bookingId" IS NULL) <> ("blockId" IS NULL));
ALTER TABLE "Booking" ADD CONSTRAINT booking_money_non_negative
  CHECK ("totalPrice" >= 0 AND "advanceAmount" >= 0 AND "onlineAmount" >= 0 AND "balanceDue" >= 0 AND "discount" >= 0);
