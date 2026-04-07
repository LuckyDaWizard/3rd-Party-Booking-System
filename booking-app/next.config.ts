import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Disable Next.js image optimizer. The runner stage of our Docker image
  // (node:20-alpine) doesn't ship with sharp / vips, so /next/image requests
  // for static assets like the CareFirst logo hang indefinitely on the
  // server. Skipping optimization serves files as-is from /public, which is
  // fine for our use case (no large images that need on-the-fly resizing).
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
