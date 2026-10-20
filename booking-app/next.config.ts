import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    // Shown under the sidebar's Contact Support button. SemVer, bumped per
    // deploy — rules in OPERATIONS.md → Versioning.
    NEXT_PUBLIC_APP_VERSION: pkg.version,
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

export default withSentryConfig(nextConfig, {
  org: "firstcaresolutions",
  project: "tpbs-web",
  sentryUrl: "https://de.sentry.io/",
  // Build-time only (source-map upload). Supplied as a BuildKit secret in
  // Docker and never committed; without it the build still succeeds and
  // just skips the upload.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Errors are grouped per release = our SemVer, so each maps to CHANGELOG.md.
  release: { name: `tpbs-web@${pkg.version}` },
  // No `tunnelRoute`: the built-in one is a blind rewrite that relays to ANY
  // Sentry org and forwards the browser's cookies (incl. the Supabase session).
  // Our own src/app/monitoring/route.ts is used instead.
  widenClientFileUpload: true,
  // Upload source maps, then delete them so our source is never served.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  silent: !process.env.CI,
});
