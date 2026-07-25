CREATE TYPE "GatheringPhase" AS ENUM ('FORMING', 'ASSIGNED');

CREATE TABLE "Gathering" (
    "id" TEXT NOT NULL,
    "phase" "GatheringPhase" NOT NULL DEFAULT 'FORMING',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "launchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Gathering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "gatheringId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "directions" VARCHAR(500) NOT NULL DEFAULT '',
    "maxCapacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coordinatorId" UUID,
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Participant" (
    "id" UUID NOT NULL,
    "gatheringId" TEXT NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "sessionTokenHash" VARCHAR(64) NOT NULL,
    "prayerCiphertext" TEXT,
    "prayerIv" VARCHAR(24),
    "prayerAuthTag" VARCHAR(24),
    "roomId" UUID,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_coordinatorId_key" ON "Room"("coordinatorId");
CREATE INDEX "Room_gatheringId_idx" ON "Room"("gatheringId");
CREATE UNIQUE INDEX "Participant_sessionTokenHash_key" ON "Participant"("sessionTokenHash");
CREATE INDEX "Participant_gatheringId_idx" ON "Participant"("gatheringId");
CREATE INDEX "Participant_roomId_idx" ON "Participant"("roomId");

ALTER TABLE "Room" ADD CONSTRAINT "Room_gatheringId_fkey" FOREIGN KEY ("gatheringId") REFERENCES "Gathering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_gatheringId_fkey" FOREIGN KEY ("gatheringId") REFERENCES "Gathering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
