import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so Railway only starts traced runtime
  // dependencies. The build script adds Next's static assets to this bundle.
  output: "standalone",
};

export default nextConfig;
