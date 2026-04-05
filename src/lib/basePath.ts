/**
 * GitHub project pages use a path prefix; `basePath` in next.config must match.
 * `NEXT_PUBLIC_*` is inlined at build time for client and server bundles.
 */
function normalizedBaseSegment(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  if (!raw) return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/$/, "") || "";
}

/**
 * Prefix root-absolute public URLs (`/file.pdf`) with the deploy base path when set.
 * Leaves `mailto:`, `tel:`, `http(s):`, and relative paths unchanged.
 */
export function publicPath(path: string): string {
  if (!path.startsWith("/")) return path;
  const base = normalizedBaseSegment();
  return base ? `${base}${path}` : path;
}
