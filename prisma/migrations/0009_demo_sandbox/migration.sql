-- Demo mode: each signed-in person can get a private sample copy of the demo turf to try the owner side.
ALTER TABLE "Turf" ADD COLUMN "isSandbox" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Turf_isSandbox_ownerId_idx" ON "Turf"("isSandbox", "ownerId");
