-- Indexes for growth: turf search filters and "near me" box, finishing past bookings, unread counts
CREATE INDEX "Turf_status_availabilityMode_idx" ON "Turf"("status", "availabilityMode");
CREATE INDEX "Turf_lat_lng_idx" ON "Turf"("lat", "lng");
CREATE INDEX "Booking_status_endAt_idx" ON "Booking"("status", "endAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
