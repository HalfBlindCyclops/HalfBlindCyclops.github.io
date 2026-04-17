export type ExperienceMiniNode = {
  id: string;
  title: string;
  bulletIndex: number;
  latitude: number;
  longitude: number;
};

/**
 * Major experience entries only (excludes earlier/short roles).
 * Mini nodes cluster around the primary Experience marker (`61, -103`).
 */
export const experienceMiniNodes: ExperienceMiniNode[] = [
  {
    id: "exp-inclusive-computing",
    title: "Inclusive Computing",
    bulletIndex: 0,
    latitude: 68.8,
    longitude: -112.6,
  },
  {
    id: "exp-startup-consulting",
    title: "Startup Consulting",
    bulletIndex: 1,
    latitude: 63.9,
    longitude: -118.7,
  },
  {
    id: "exp-boston-globe-media",
    title: "Boston Globe Media",
    bulletIndex: 2,
    latitude: 58.4,
    longitude: -114.2,
  },
  {
    id: "exp-vita-needle",
    title: "Vita Needle",
    bulletIndex: 3,
    latitude: 54.7,
    longitude: -106.5,
  },
];

const experienceMiniNodeIdByBulletIndex = new Map<number, string>();

experienceMiniNodes.forEach((node) => {
  experienceMiniNodeIdByBulletIndex.set(node.bulletIndex, node.id);
});

export function getExperienceMiniNodeId(bulletIndex: number): string | null {
  return experienceMiniNodeIdByBulletIndex.get(bulletIndex) ?? null;
}
