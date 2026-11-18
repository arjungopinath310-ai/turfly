-- Owner pricing (free period, then a capped Turfly fee per online booking) and Turf coins for players.
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "coinsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coinsValue" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Turf" ADD COLUMN     "freeUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CoinEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "bookingId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoinEntry_userId_createdAt_idx" ON "CoinEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoinEntry_bookingId_kind_key" ON "CoinEntry"("bookingId", "kind");

-- AddForeignKey
ALTER TABLE "CoinEntry" ADD CONSTRAINT "CoinEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinEntry" ADD CONSTRAINT "CoinEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

