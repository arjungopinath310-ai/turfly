-- 1) Hourly slots: new default, and move every existing turf to a 1-hour grid.
--    Existing bookings are untouched; only future slot generation changes.
-- AlterTable
ALTER TABLE "Turf" ALTER COLUMN "slotStepMinutes" SET DEFAULT 60,
ALTER COLUMN "allowedDurations" SET DEFAULT ARRAY[60, 120]::INTEGER[];

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "turfId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageText" TEXT,
    "lastSenderId" TEXT,
    "playerLastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerLastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_playerId_lastMessageAt_idx" ON "Conversation"("playerId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_turfId_lastMessageAt_idx" ON "Conversation"("turfId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_turfId_playerId_key" ON "Conversation"("turfId", "playerId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


UPDATE "Turf" SET "slotStepMinutes" = 60 WHERE "slotStepMinutes" <> 60;
-- keep only durations that fill whole hours (90 min would leave an unbookable half hour)
UPDATE "Turf" SET "allowedDurations" = ARRAY(SELECT d FROM unnest("allowedDurations") AS d WHERE d % 60 = 0 ORDER BY d);
UPDATE "Turf" SET "allowedDurations" = ARRAY[60, 120] WHERE cardinality("allowedDurations") = 0;

-- 2) Chat guards
ALTER TABLE "Message" ADD CONSTRAINT message_body_length CHECK (char_length("body") BETWEEN 1 AND 1000);
