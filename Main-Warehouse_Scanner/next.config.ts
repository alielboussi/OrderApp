import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/Main-Warehouse_Scanner",
        destination: "/transfer-portal",
      },
      {
        source: "/Main-Warehouse_Scanner/:path*",
        destination: "/transfer-portal/:path*",
      },
    ];
  },
};

export default nextConfig;
