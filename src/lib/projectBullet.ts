/** Split resume-style project bullets into title + body. */
export function miniBulletParts(bullet: string): { summary: string; details: string } {
  const clean = bullet.replace(/\*\*/g, "");
  const colon = clean.indexOf(": ");
  if (colon > 0 && colon < clean.length - 2) {
    return {
      summary: clean.slice(0, colon),
      details: clean.slice(colon + 2),
    };
  }
  return { summary: clean, details: clean };
}
