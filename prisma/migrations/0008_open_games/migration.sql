-- Open games: players short for a booked slot list it; others ask to join and chat with the organiser.
-- AlterTable
ALTER TABLE "PlayerPost" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PlayerPostRequest" ADD COLUMN     "lastMessageAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlayerPostMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPostMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerPostMessage_requestId_createdAt_idx" ON "PlayerPostMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerPostMessage_senderId_createdAt_idx" ON "PlayerPostMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerPost_status_startAt_idx" ON "PlayerPost"("status", "startAt");

-- CreateIndex
CREATE INDEX "PlayerPost_turfId_status_startAt_idx" ON "PlayerPost"("turfId", "status", "startAt");

-- CreateIndex
CREATE INDEX "PlayerPost_bookingId_idx" ON "PlayerPost"("bookingId");

-- CreateIndex
CREATE INDEX "PlayerPostRequest_userId_status_idx" ON "PlayerPostRequest"("userId", "status");

-- AddForeignKey
ALTER TABLE "PlayerPostMessage" ADD CONSTRAINT "PlayerPostMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlayerPostRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPostMessage" ADD CONSTRAINT "PlayerPostMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most one listing per booking that isn't closed (not expressible in the Prisma schema).
CREATE UNIQUE INDEX "PlayerPost_bookingId_active_key" ON "PlayerPost"("bookingId") WHERE "bookingId" IS NOT NULL AND status <> 'CLOSED';
