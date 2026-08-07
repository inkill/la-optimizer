import type { NextConfig } from "next";

const isExport = process.env.GITHUB_PAGES === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: isExport ? "export" : undefined,
  // basePath must be set for GitHub Pages project sites (repo name as prefix).
  // For user sites (username.github.io) or custom domains, leave empty.
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: {
    // Disable Next.js Image optimization (not available on static hosting).
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0"],
};

export default nextConfig;
