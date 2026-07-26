import { disconnectDatabase, getDatabase } from "../src/lib/db";
import { seedProductionJourney } from "../src/lib/journey/seed";

void seedProductionJourney(getDatabase())
  .then((result) => {
    console.log(`Production journey seed complete: ${result}.`);
  })
  .catch((error: unknown) => {
    console.error("Production journey seed failed", error);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
