// Loads DATABASE_URL from `.env` for a local `pnpm db:check`; the preceding
// `prisma generate` runs in its own process, so its dotenv load does not reach
// here. No-ops where the environment already supplies the variable.
import "dotenv/config";

import { disconnectDatabase, pingDatabase } from "../src/lib/db";

async function main() {
  try {
    await pingDatabase();
    console.log("Database connection succeeded");
  } catch {
    console.error("Database connection failed");
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void main();
