import type { NextConfig } from "next";

function basePathFromEnv(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  if (!raw) return undefined;
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = withSlash.replace(/\/$/, "");
  return normalized || undefined;
}

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: basePathFromEnv(),
};

export default nextConfig;
