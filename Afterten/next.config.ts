import path from "path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  reactCompiler: true,
  // next is hoisted to C:\Projects\Afterten\node_modules; Turbopack must use that root.
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
