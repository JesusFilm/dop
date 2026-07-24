import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Railway image stays small
  // and `next start` has everything it needs at runtime.
  output: "standalone",
};

export default nextConfig;
