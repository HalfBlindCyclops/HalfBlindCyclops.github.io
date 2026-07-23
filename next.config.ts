import type { NextConfig } from "next";

function basePathFromEnv(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  if (!raw) return undefined;
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = withSlash.replace(/\/$/, "");
  return normalized || undefined;
}

/**
 * Static export cannot use the default Next.js Image Optimization API (no server to run it).
 * Keep `unoptimized: true` and ship tuned rasters from `/public` (WebP, sized per breakpoint where needed).
 * On the host/CDN, set long `Cache-Control` for `/_next/static/*` and versioned asset URLs.
 */
const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages serves `/path/` from `path/index.html`; without this, Next emits `path.html`
  // and only `/path` (no trailing slash) works.
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    webVitalsAttribution: ["LCP", "INP", "CLS"],
  },
  basePath: basePathFromEnv(),
};

export default nextConfig;
