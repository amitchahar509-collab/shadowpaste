import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Type errors now fail the build. The app surface (src/) typechecks clean;
  // the Bun/Node surfaces (cli/, tests/) are checked separately via
  // `bun run typecheck` against tsconfig.node.json.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
