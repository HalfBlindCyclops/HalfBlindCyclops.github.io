export type ExperienceMiniNode = {
  id: string;
  title: string;
  bulletIndex: number;
  latitude: number;
  longitude: number;
};

/**
 * Major experience entries only (excludes earlier/short roles).
 * Mini nodes cluster around the primary Experience marker in Europe.
 */
export const experienceMiniNodes: ExperienceMiniNode[] = [
  {
    id: "exp-inclusive-computing",
    title: "Inclusive Computing",
    bulletIndex: 0,
    latitude: 52.3676,
    longitude: 4.9041,
  },
  {
    id: "exp-startup-consulting",
    title: "Startup Consulting",
    bulletIndex: 1,
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    id: "exp-boston-globe-media",
    title: "Boston Globe Media",
    bulletIndex: 2,
    latitude: 52.52,
    longitude: 13.405,
  },
  {
    id: "exp-vita-needle",
    title: "Vita Needle",
    bulletIndex: 3,
    latitude: 41.9028,
    longitude: 12.4964,
  },
];

const experienceMiniNodeIdByBulletIndex = new Map<number, string>();

experienceMiniNodes.forEach((node) => {
  experienceMiniNodeIdByBulletIndex.set(node.bulletIndex, node.id);
});

export function getExperienceMiniNodeId(bulletIndex: number): string | null {
  return experienceMiniNodeIdByBulletIndex.get(bulletIndex) ?? null;
}
