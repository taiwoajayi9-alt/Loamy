import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Admins upload product photos (up to 10 MB) through server actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
