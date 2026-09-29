import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Scoutbook advancement export upload (about 1 MB per 5,000 rows)
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
