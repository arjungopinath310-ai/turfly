-- Photos players add to listed turfs; they appear on the turf after an admin approves them.
CREATE TABLE "TurfPhotoSuggestion" (
    "id" TEXT NOT NULL,
    "turfId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "TurfPhotoSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TurfPhotoSuggestion_status_createdAt_idx" ON "TurfPhotoSuggestion"("status", "createdAt");
CREATE INDEX "TurfPhotoSuggestion_turfId_idx" ON "TurfPhotoSuggestion"("turfId");
CREATE INDEX "TurfPhotoSuggestion_userId_createdAt_idx" ON "TurfPhotoSuggestion"("userId", "createdAt");
ALTER TABLE "TurfPhotoSuggestion" ADD CONSTRAINT "TurfPhotoSuggestion_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TurfPhotoSuggestion" ADD CONSTRAINT "TurfPhotoSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
