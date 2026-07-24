import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = join(projectRoot, ".next", "standalone");

if (!existsSync(standaloneRoot)) {
  throw new Error("Next.js standalone output was not generated");
}

const copies = [
  [
    join(projectRoot, ".next", "static"),
    join(standaloneRoot, ".next", "static"),
  ],
  [join(projectRoot, "public"), join(standaloneRoot, "public")],
];

for (const [source, destination] of copies) {
  if (existsSync(source)) {
    cpSync(source, destination, { recursive: true });
  }
}
