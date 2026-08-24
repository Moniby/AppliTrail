import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained Node server for containers while preserving the
  // existing Cloudflare Worker build used by Sites.
  output: "standalone",
};

export default nextConfig;
