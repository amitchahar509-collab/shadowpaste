import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the file-tracing root to this project. Next otherwise walks up looking
  // for a lockfile, and an unrelated one in a parent directory (e.g. a stray
  // ~/package-lock.json) makes it emit the standalone bundle nested under
  // .next/standalone/<relative-path-to-project>/server.js — which silently
  // breaks both the post-build asset copy and `bun run start`.
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Type errors now fail the build. The app surface (src/) typechecks clean;
  // the Bun/Node surfaces (cli/, tests/) are checked separately via
  // `bun run typecheck` against tsconfig.node.json.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
