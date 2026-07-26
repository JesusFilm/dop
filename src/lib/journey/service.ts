import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { validateJourneyModule } from "@/lib/journey/registry";
import type { ValidJourney } from "@/lib/journey/types";

type Database = Prisma.TransactionClient | PrismaClient;

export async function getValidJourney(
  database: Database,
  journeyId: string | null,
): Promise<ValidJourney | null> {
  if (!journeyId) return null;

  const journey = await database.journey.findUnique({
    where: { id: journeyId },
    include: { modules: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  });
  if (!journey || journey.modules.length === 0) return null;

  try {
    const modules = journey.modules.map((module, index) => {
      if (
        module.position !== index ||
        module.recommendedSeconds <= 0 ||
        module.recommendedSeconds > 10_800
      ) {
        throw new Error("Invalid journey module ordering or duration");
      }
      return {
        id: module.id,
        position: module.position,
        title: module.title,
        recommendedSeconds: module.recommendedSeconds,
        ...validateJourneyModule(module.behaviorKey, module.configuration),
      };
    });
    const recommendedSeconds = modules.reduce(
      (total, module) => total + module.recommendedSeconds,
      0,
    );
    if (recommendedSeconds < 3_600 || recommendedSeconds > 5_400) {
      return null;
    }
    return { id: journey.id, name: journey.name, modules };
  } catch {
    return null;
  }
}
