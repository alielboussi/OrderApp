import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/",
        destination: "/transfer-portal",
      },
      {
        source: "/Beverages_Storeroom_Scanner",
        destination: "/transfer-portal",
      },
      {
        source: "/Beverages_Storeroom_Scanner/",
        destination: "/transfer-portal",
      },
      {
        source: "/Beverages_Storeroom_Scanner/:path*",
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
