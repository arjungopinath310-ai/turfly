-- Turfs found on OpenStreetMap near players anywhere in India, listed as unclaimed until the owner joins.
ALTER TABLE "Turf" ADD COLUMN "source" TEXT,
ADD COLUMN "sourceRef" TEXT;
CREATE UNIQUE INDEX "Turf_sourceRef_key" ON "Turf"("sourceRef");

CREATE TABLE "DiscoveryCell" (
    "key" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DiscoveryCell_pkey" PRIMARY KEY ("key")
);
