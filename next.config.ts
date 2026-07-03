import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    instantNavigationDevToolsToggle: true,
  },
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],
  outputFileTracingIncludes: {
    "/api/internal/agent-reports/run-subscriptions": [
      "node_modules/@sparticuz/chromium/**/*",
      "node_modules/playwright-core/**/*",
    ],
    "/api/internal/agent-reports/\\[id\\]/dispatch-preview-image": [
      "node_modules/@sparticuz/chromium/**/*",
      "node_modules/playwright-core/**/*",
    ],
  },
};

export default nextConfig;
