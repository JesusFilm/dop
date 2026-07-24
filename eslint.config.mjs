import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: directory });

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([
    ".next/**",
    "coverage/**",
    "node_modules/**",
    "src/generated/**",
    "next-env.d.ts",
  ]),
  // Privacy #3 data boundary: the generated Prisma client may only be imported
  // by the data layer (db.ts constructs it; repository.ts is the sanctioned
  // accessor). Any other module must go through @/lib/repository so the
  // "no all-requests path" guarantee cannot be bypassed with a raw query.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/generated/prisma", "@/generated/prisma/*"],
              message:
                "Import the data layer from @/lib/repository — do not use the generated Prisma client directly (Privacy #3 boundary).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/db.ts", "src/lib/repository.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);
