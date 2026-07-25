ALTER TABLE "Room"
ADD CONSTRAINT "Room_maxCapacity_minimum"
CHECK ("maxCapacity" IS NULL OR "maxCapacity" >= 2);
