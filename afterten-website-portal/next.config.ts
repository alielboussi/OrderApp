import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const portalRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(portalRoot, "..");

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
