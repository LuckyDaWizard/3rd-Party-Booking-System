import type { NextConfig } from "next";
import { execSync } from "child_process";
import pkg from "./package.json";

// Version shown under the sidebar's Contact Support button, e.g.
// "Version 1.3.5 (e47880b)". The number is package.json's SemVer (bumping
// rules in OPERATIONS.md → Versioning); the build id is the short git SHA.
// Docker builds get the SHA via the APP_BUILD build-arg (= IMAGE_TAG) since
// .git is dockerignored; local builds read the checkout, then fall back to "dev".
function appBuild(): string {
  if (process.env.NEXT_PUBLIC_APP_BUILD) return process.env.NEXT_PUBLIC_APP_BUILD;
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_BUILD: appBuild(),
  },
  // Disable Next.js image optimizer. The runner stage of our Docker image
  // (node:24-alpine) doesn't ship with sharp / vips, so /next/image requests
  // for static assets like the CareFirst logo hang indefinitely on the
  // server. Skipping optimization serves files as-is from /public, which is
  // fine for our use case (no large images that need on-the-fly resizing).
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
