import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Agent Mode HTTPS preview host to load dev-only Next.js endpoints.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
