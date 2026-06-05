import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'app.xcp.io' },
    ],
  },
};

export default nextConfig;
