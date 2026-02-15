import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: '../..',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'app.xcp.io' },
    ],
  },
};

export default nextConfig;
