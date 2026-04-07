/**
 * Global site accent — RGB(118, 224, 252). Change here to retheme pins, signal, nav, and panels.
 */
export const ACCENT_COLOR_HEX = "#76e0fc";

/** Parse hex / rgb() / rgba() into CSS rgba(). */
export function colorToRgba(color: string, alpha: number): string {
  const c = color.trim();
  const a = Math.max(0, Math.min(1, alpha));

  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) {
      h = h
        .split("")
        .map((ch) => ch + ch)
        .join("");
    } else if (h.length === 8) {
      h = h.slice(0, 6);
    }
    if (h.length === 6) {
      const n = parseInt(h, 16);
      if (!Number.isNaN(n)) {
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r},${g},${b},${a})`;
      }
    }
  }

  const m = c.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (m) {
      return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  }

  const { r, g, b } = { r: 118, g: 224, b: 252 }; // ACCENT_COLOR_HEX
  return `rgba(${r},${g},${b},${a})`;
}
