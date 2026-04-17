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
    latitude: 42.6,
    longitude: -159.8,
  },
  {
    id: "systems-binary-exploitation",
    title: "Binary Exploitation",
    subsection: "systems",
    subsectionIndex: 1,
    latitude: 47.1,
    longitude: -154.3,
  },
  {
    id: "systems-secure-crawler",
    title: "Secure Web Crawler",
    subsection: "systems",
    subsectionIndex: 2,
    latitude: 41.2,
    longitude: -149.2,
  },
  {
    id: "security-crypto-analysis",
    title: "Crypto Analysis",
    subsection: "security",
    subsectionIndex: 0,
    latitude: 36.7,
    longitude: -158.6,
  },
  {
    id: "security-web-vuln-suite",
    title: "Web Vulnerability Suite",
    subsection: "security",
    subsectionIndex: 1,
    latitude: 39.8,
    longitude: -152.1,
  },
  {
    id: "webdev-ai-curriculum-mapper",
    title: "AI Curriculum Mapper",
    subsection: "webDev",
    subsectionIndex: 0,
    latitude: 32.9,
    longitude: -148.7,
  },
  {
    id: "webdev-huskender",
    title: "Huskender",
    subsection: "webDev",
    subsectionIndex: 1,
    latitude: 35.6,
    longitude: -161.2,
  },
  {
    id: "webdev-dev-exchange",
    title: "Dev Exchange",
    subsection: "webDev",
    subsectionIndex: 2,
    latitude: 44.3,
    longitude: -146.7,
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
