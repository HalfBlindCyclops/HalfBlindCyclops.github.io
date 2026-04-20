export type ExperienceMiniNode = {
  id: string;
  title: string;
  bulletIndex: number;
  latitude: number;
  longitude: number;
};

/**
 * Major experience entries only (excludes earlier/short roles).
 * Mini nodes cluster around the primary Experience marker (`61, -128`).
 */
export const experienceMiniNodes: ExperienceMiniNode[] = [
  {
    id: "exp-inclusive-computing",
    title: "Inclusive Computing",
    bulletIndex: 0,
    latitude: 72.4,
    longitude: -153.9,
  },
  {
    id: "exp-startup-consulting",
    title: "Startup Consulting",
    bulletIndex: 1,
    latitude: 66.1,
    longitude: -146.4,
  },
  {
    id: "exp-boston-globe-media",
    title: "Boston Globe Media",
    bulletIndex: 2,
    latitude: 61.7,
    longitude: -158.2,
  },
  {
    id: "exp-vita-needle",
    title: "Vita Needle",
    bulletIndex: 3,
    latitude: 56.8,
    longitude: -149.6,
  },
];

const experienceMiniNodeIdByBulletIndex = new Map<number, string>();

experienceMiniNodes.forEach((node) => {
  experienceMiniNodeIdByBulletIndex.set(node.bulletIndex, node.id);
});

export function getExperienceMiniNodeId(bulletIndex: number): string | null {
  return experienceMiniNodeIdByBulletIndex.get(bulletIndex) ?? null;
}
