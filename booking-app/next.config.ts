import type { NextConfig } from "next";
import { execSync } from "child_process";

// Build identifier shown under the sidebar's Contact Support button. Docker
// builds pass it in via the APP_VERSION build-arg (= IMAGE_TAG); local builds
// fall back to the checkout's short SHA, then "dev".
function appVersion(): string {
  if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION;
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
    NEXT_PUBLIC_APP_VERSION: appVersion(),
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
