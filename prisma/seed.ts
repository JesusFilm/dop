import {
  INITIAL_ROOMS,
  seedInitialRooms,
} from "../src/lib/gathering/seed-rooms";
import { disconnectDatabase, getDatabase } from "../src/lib/db";

async function main() {
  const createdCount = await seedInitialRooms(getDatabase());
  const existingCount = INITIAL_ROOMS.length - createdCount;

  console.log(
    `Room seed complete: ${createdCount} created, ${existingCount} already present.`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error("Room seed failed", error);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
