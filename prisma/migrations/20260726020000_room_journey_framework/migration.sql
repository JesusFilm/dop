ALTER TABLE "Gathering" ADD COLUMN "journeyId" UUID;

CREATE TABLE "Journey" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JourneyModule" (
    "id" UUID NOT NULL,
    "journeyId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "behaviorKey" VARCHAR(100) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "recommendedSeconds" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JourneyModule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JourneyModule_positive_duration" CHECK ("recommendedSeconds" > 0),
    CONSTRAINT "JourneyModule_nonnegative_position" CHECK ("position" >= 0)
);

CREATE TABLE "RoomJourney" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "journeyId" UUID NOT NULL,
    "currentModuleId" UUID,
    "moduleStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "moduleState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomJourney_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Gathering_journeyId_idx" ON "Gathering"("journeyId");
CREATE UNIQUE INDEX "JourneyModule_journeyId_position_key" ON "JourneyModule"("journeyId", "position");
CREATE UNIQUE INDEX "JourneyModule_id_journeyId_key" ON "JourneyModule"("id", "journeyId");
CREATE INDEX "JourneyModule_journeyId_idx" ON "JourneyModule"("journeyId");
CREATE UNIQUE INDEX "RoomJourney_roomId_key" ON "RoomJourney"("roomId");
CREATE INDEX "RoomJourney_journeyId_idx" ON "RoomJourney"("journeyId");
CREATE INDEX "RoomJourney_currentModuleId_idx" ON "RoomJourney"("currentModuleId");

ALTER TABLE "Gathering" ADD CONSTRAINT "Gathering_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JourneyModule" ADD CONSTRAINT "JourneyModule_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomJourney" ADD CONSTRAINT "RoomJourney_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomJourney" ADD CONSTRAINT "RoomJourney_journeyId_fkey"
  FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomJourney" ADD CONSTRAINT "RoomJourney_currentModuleId_fkey"
  FOREIGN KEY ("currentModuleId", "journeyId") REFERENCES "JourneyModule"("id", "journeyId") ON DELETE RESTRICT ON UPDATE CASCADE;
