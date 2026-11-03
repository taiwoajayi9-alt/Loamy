import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Admins upload product photos (up to 5 MB) through server actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
