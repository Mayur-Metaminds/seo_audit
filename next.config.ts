import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep Playwright out of the bundler — it loads Chromium at runtime on the server.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
