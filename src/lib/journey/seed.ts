import type { PrismaClient } from "@/generated/prisma/client";
import { ACTIVE_GATHERING_ID } from "@/lib/gathering/constants";

export const PRODUCTION_JOURNEY_ID = "2b27f04e-0cf2-4bf4-b3d6-2ddc08f6a001";
export const SHORT_STUDY_MODULE_ID = "2b27f04e-0cf2-4bf4-b3d6-2ddc08f6a002";

export const SHORT_STUDY_CONFIGURATION = {
  passageReference: "Hebrews 4:14–16",
  scriptureText:
    "14 Therefore, since we have a great high priest who has passed through the heavens, Jesus the Son of God, let us hold firmly to what we profess.\n\n15 For we do not have a high priest who is unable to sympathize with our weaknesses, but One who was tempted in every way that we are, yet was without sin.\n\n16 Let us then approach the throne of grace with confidence, so that we may receive mercy and find grace to help us in our time of need.",
  translation: "Berean Standard Bible (BSB)",
  reflections: [
    "Jesus understands our weakness. Prayer does not require us to pretend that we are stronger or more spiritual than we are.",
    "Jesus gives us confident access to God. We approach because of Christ, not because of how well we pray.",
    "God offers mercy, grace, and timely help. We can bring our real needs to a God who welcomes and helps us.",
  ],
  discussionQuestion:
    "How should knowing that God welcomes us with mercy and grace shape the way we pray today?",
} as const;

export async function seedProductionJourney(
  database: PrismaClient,
): Promise<"attached" | "preserved-existing"> {
  return database.$transaction(async (transaction) => {
    await transaction.gathering.upsert({
      where: { id: ACTIVE_GATHERING_ID },
      create: { id: ACTIVE_GATHERING_ID },
      update: {},
    });
    await transaction.$queryRaw`
      SELECT "id"
      FROM "Gathering"
      WHERE "id" = ${ACTIVE_GATHERING_ID}
      FOR UPDATE
    `;
    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    const runningCanonicalJourney =
      gathering.phase === "ASSIGNED" &&
      gathering.journeyId === PRODUCTION_JOURNEY_ID &&
      (await transaction.roomJourney.count({
        where: { journeyId: PRODUCTION_JOURNEY_ID },
      })) > 0;

    await transaction.journey.upsert({
      where: { id: PRODUCTION_JOURNEY_ID },
      create: {
        id: PRODUCTION_JOURNEY_ID,
        name: "Day of Prayer",
      },
      update: runningCanonicalJourney ? {} : { name: "Day of Prayer" },
    });

    if (!runningCanonicalJourney) {
      await transaction.journeyModule.upsert({
        where: { id: SHORT_STUDY_MODULE_ID },
        create: {
          id: SHORT_STUDY_MODULE_ID,
          journeyId: PRODUCTION_JOURNEY_ID,
          position: 0,
          behaviorKey: "short-study",
          title: "Why we pray",
          recommendedSeconds: 3_600,
          configuration: SHORT_STUDY_CONFIGURATION,
        },
        update: {
          journeyId: PRODUCTION_JOURNEY_ID,
          position: 0,
          behaviorKey: "short-study",
          title: "Why we pray",
          recommendedSeconds: 3_600,
          configuration: SHORT_STUDY_CONFIGURATION,
        },
      });
    }

    if (
      gathering.phase === "ASSIGNED" &&
      gathering.journeyId &&
      gathering.journeyId !== PRODUCTION_JOURNEY_ID
    ) {
      return "preserved-existing";
    }

    await transaction.gathering.update({
      where: { id: ACTIVE_GATHERING_ID },
      data: { journeyId: PRODUCTION_JOURNEY_ID },
    });

    if (gathering.phase === "ASSIGNED") {
      const occupiedRooms = await transaction.room.findMany({
        where: {
          gatheringId: ACTIVE_GATHERING_ID,
          participants: { some: {} },
        },
        select: { id: true },
      });
      await transaction.roomJourney.createMany({
        data: occupiedRooms.map((room) => ({
          roomId: room.id,
          journeyId: PRODUCTION_JOURNEY_ID,
        })),
        skipDuplicates: true,
      });
    }

    return "attached";
  });
}
