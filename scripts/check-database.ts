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
