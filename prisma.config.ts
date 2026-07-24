import "dotenv/config";

import { defineConfig } from "prisma/config";

const localDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/secret_prayer";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
