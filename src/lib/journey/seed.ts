import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ACTIVE_GATHERING_ID } from "@/lib/gathering/constants";
import {
  KNOWING_GOD_MODULE_ID,
  MINISTRY_PRAYER_MODULE_ID,
  PRODUCTION_JOURNEY_ID,
  SHORT_STUDY_MODULE_ID,
} from "@/lib/journey/constants";
import { JULY_MINISTRY_PRAYER_CONFIGURATION } from "@/lib/journey/ministry-prayer-seed";

export {
  KNOWING_GOD_MODULE_ID,
  MINISTRY_PRAYER_MODULE_ID,
  PRODUCTION_JOURNEY_ID,
  SHORT_STUDY_MODULE_ID,
};

export const KNOWING_GOD_CONFIGURATION = {
  passageReference: "Ephesians 1:15–23",
  scriptureText:
    "15 For this reason, ever since I heard about your faith in the Lord Jesus and your love for all the saints,\n\n16 I have not stopped giving thanks for you, remembering you in my prayers,\n\n17 that the God of our Lord Jesus Christ, the glorious Father, may give you a spirit of wisdom and revelation in your knowledge of Him.\n\n18 I ask that the eyes of your heart may be enlightened, so that you may know the hope of His calling, the riches of His glorious inheritance in the saints,\n\n19 and the surpassing greatness of His power to us who believe. These are in accordance with the working of His mighty strength,\n\n20 which He exerted in Christ when He raised Him from the dead and seated Him at His right hand in the heavenly realms,\n\n21 far above all rule and authority, power and dominion, and every name that is named, not only in the present age but also in the one to come.\n\n22 And God put everything under His feet and made Him head over everything for the church,\n\n23 which is His body, the fullness of Him who fills all in all.",
  translation: "Berean Standard Bible (BSB)",
  reflections: [
    "Knowing Christ: Paul prays that God would give us wisdom and revelation so that we may know Him—not merely know facts about Him, but know Christ personally and be transformed by Him.",
    "Enlightened hearts: When God enlightens the eyes of our hearts, we begin to grasp the hope of His calling, the riches of His inheritance, and the surpassing greatness of His power toward those who believe.",
    "Confident hope: Christian hope is confident expectation that God will fulfill every promise in Christ. We will receive our inheritance, be united with the Lord, and one day be free from sin, pain, sickness, and struggle.",
  ],
  discussionQuestion: "What would it look like for us to pray like Paul today?",
} as const;

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

async function lockGathering(
  transaction: Prisma.TransactionClient,
): Promise<void> {
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
}

export async function seedProductionJourney(
  database: PrismaClient,
): Promise<"attached" | "preserved-existing"> {
  return database.$transaction(async (transaction) => {
    await lockGathering(transaction);
    const gathering = await transaction.gathering.findUniqueOrThrow({
      where: { id: ACTIVE_GATHERING_ID },
    });
    await transaction.journey.upsert({
      where: { id: PRODUCTION_JOURNEY_ID },
      create: {
        id: PRODUCTION_JOURNEY_ID,
        name: "Day of Prayer",
      },
      update: { name: "Day of Prayer" },
    });

    const knowingGodModule = {
      id: KNOWING_GOD_MODULE_ID,
      journeyId: PRODUCTION_JOURNEY_ID,
      position: 0,
      behaviorKey: "short-study",
      title: "Knowing God",
      recommendedSeconds: 600,
      configuration: KNOWING_GOD_CONFIGURATION,
    } as const;
    const whyWePrayModule = {
      id: SHORT_STUDY_MODULE_ID,
      journeyId: PRODUCTION_JOURNEY_ID,
      position: 1,
      behaviorKey: "short-study",
      title: "Why we pray",
      recommendedSeconds: 600,
      configuration: SHORT_STUDY_CONFIGURATION,
    } as const;
    const ministryPrayerModule = {
      id: MINISTRY_PRAYER_MODULE_ID,
      journeyId: PRODUCTION_JOURNEY_ID,
      position: 2,
      behaviorKey: "ministry-prayer",
      title: "Pray for our ministries",
      recommendedSeconds: 2_400,
      configuration: JULY_MINISTRY_PRAYER_CONFIGURATION,
    } as const;

    await transaction.journeyModule.upsert({
      where: { id: KNOWING_GOD_MODULE_ID },
      create: knowingGodModule,
      update: knowingGodModule,
    });
    await transaction.journeyModule.upsert({
      where: { id: SHORT_STUDY_MODULE_ID },
      create: whyWePrayModule,
      update: whyWePrayModule,
    });
    await transaction.journeyModule.upsert({
      where: { id: MINISTRY_PRAYER_MODULE_ID },
      create: ministryPrayerModule,
      update: ministryPrayerModule,
    });

    if (gathering.journeyId && gathering.journeyId !== PRODUCTION_JOURNEY_ID) {
      return "preserved-existing";
    }

    if (gathering.journeyId !== PRODUCTION_JOURNEY_ID) {
      await transaction.gathering.update({
        where: { id: ACTIVE_GATHERING_ID },
        data: { journeyId: PRODUCTION_JOURNEY_ID },
      });
    }

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
