import type { ResumeProjectSubsections } from "@/data/resumeNodes";

export type ProjectMiniNode = {
  id: string;
  title: string;
  subsection: keyof ResumeProjectSubsections;
  subsectionIndex: number;
  latitude: number;
  longitude: number;
};

/**
 * Mini nodes cluster around the primary Projects marker (`34, -140`) so users can
 * drill into individual projects without leaving the Projects section context.
 */
export const projectMiniNodes: ProjectMiniNode[] = [
  {
    id: "systems-wan-dht",
    title: "WAN DHT",
    subsection: "systems",
    subsectionIndex: 0,
    latitude: 31.2,
    longitude: -146.2,
  },
  {
    id: "systems-binary-exploitation",
    title: "Binary Exploitation",
    subsection: "systems",
    subsectionIndex: 1,
    latitude: 36.1,
    longitude: -145.3,
  },
  {
    id: "systems-secure-crawler",
    title: "Secure Web Crawler",
    subsection: "systems",
    subsectionIndex: 2,
    latitude: 39.1,
    longitude: -141.4,
  },
  {
    id: "security-crypto-analysis",
    title: "Crypto Analysis",
    subsection: "security",
    subsectionIndex: 0,
    latitude: 38.2,
    longitude: -136.2,
  },
  {
    id: "security-web-vuln-suite",
    title: "Web Vulnerability Suite",
    subsection: "security",
    subsectionIndex: 1,
    latitude: 34.5,
    longitude: -133.8,
  },
  {
    id: "webdev-ai-curriculum-mapper",
    title: "AI Curriculum Mapper",
    subsection: "webDev",
    subsectionIndex: 0,
    latitude: 29.9,
    longitude: -134.6,
  },
  {
    id: "webdev-huskender",
    title: "Huskender",
    subsection: "webDev",
    subsectionIndex: 1,
    latitude: 27.7,
    longitude: -139.1,
  },
  {
    id: "webdev-dev-exchange",
    title: "Dev Exchange",
    subsection: "webDev",
    subsectionIndex: 2,
    latitude: 30.1,
    longitude: -143.6,
  },
];

const projectMiniNodeIdBySubsectionAndIndex = new Map<string, string>();

projectMiniNodes.forEach((node) => {
  projectMiniNodeIdBySubsectionAndIndex.set(
    `${node.subsection}:${node.subsectionIndex}`,
    node.id,
  );
});

export function getProjectMiniNodeId(
  subsection: keyof ResumeProjectSubsections,
  subsectionIndex: number,
): string | null {
  return projectMiniNodeIdBySubsectionAndIndex.get(`${subsection}:${subsectionIndex}`) ?? null;
}
