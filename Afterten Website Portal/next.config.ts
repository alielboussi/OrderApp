import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const portalRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    root: portalRoot,
  },
};

export default nextConfig;
