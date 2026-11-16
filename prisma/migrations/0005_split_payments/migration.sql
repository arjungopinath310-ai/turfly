-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "splitCollected" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "splitShareId" TEXT;

-- CreateTable
CREATE TABLE "SplitPlan" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "players" INTEGER NOT NULL,
    "shareAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "SplitPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitShare" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "claimedById" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "paidById" TEXT,
    "paidPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "SplitShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SplitPlan_bookingId_key" ON "SplitPlan"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "SplitPlan_token_key" ON "SplitPlan"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SplitShare_paidPaymentId_key" ON "SplitShare"("paidPaymentId");

-- CreateIndex
CREATE INDEX "SplitShare_planId_status_idx" ON "SplitShare"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SplitShare_planId_seq_key" ON "SplitShare"("planId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "SplitShare_planId_paidById_key" ON "SplitShare"("planId", "paidById");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_splitShareId_fkey" FOREIGN KEY ("splitShareId") REFERENCES "SplitShare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPlan" ADD CONSTRAINT "SplitPlan_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitShare" ADD CONSTRAINT "SplitShare_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SplitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitShare" ADD CONSTRAINT "SplitShare_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity: shares are positive, money never goes negative, statuses are known values.
ALTER TABLE "SplitPlan" ADD CONSTRAINT "SplitPlan_amounts_check" CHECK ("players" BETWEEN 2 AND 30 AND "shareAmount" > 0);
ALTER TABLE "SplitShare" ADD CONSTRAINT "SplitShare_status_check" CHECK ("status" IN ('OPEN', 'PAID', 'REFUNDED'));
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_splitCollected_check" CHECK ("splitCollected" >= 0);
