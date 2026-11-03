import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Namecheap's Node.js (Passenger) hosting: no node_modules install on the server.
  output: "standalone",
  experimental: {
    // Admins upload product photos (up to 10 MB) through server actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
