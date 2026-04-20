import type { ResumeProjectSubsections } from "@/data/resumeNodes";

export type ProjectMiniNode = {
  id: string;
  title: string;
  subsection: keyof ResumeProjectSubsections;
  subsectionIndex: number;
  latitude: number;
  longitude: number;
};

export type ProjectMiniNodeProfile = {
  timeframe: string;
  role: string;
  stack: string[];
  highlights: string[];
  impact: string;
  status: string;
  links?: Array<{
    label: string;
    href: string;
  }>;
};

/**
 * Mini nodes cluster around the primary Projects marker (`1.3521, 103.8198`) so users can
 * drill into individual projects without leaving the Projects section context.
 */
export const projectMiniNodes: ProjectMiniNode[] = [
  {
    id: "systems-wan-dht",
    title: "WAN DHT",
    subsection: "systems",
    subsectionIndex: 0,
    latitude: 6.7521,
    longitude: 109.0198,
  },
  {
    id: "systems-binary-exploitation",
    title: "Binary Exploitation",
    subsection: "systems",
    subsectionIndex: 1,
    latitude: 11.2321,
    longitude: 114.5198,
  },
  {
    id: "systems-secure-crawler",
    title: "Secure Web Crawler",
    subsection: "systems",
    subsectionIndex: 2,
    latitude: 4.1821,
    longitude: 119.6198,
  },
  {
    id: "security-crypto-analysis",
    title: "Crypto Analysis",
    subsection: "security",
    subsectionIndex: 0,
    latitude: 1.6421,
    longitude: 110.2198,
  },
  {
    id: "security-web-vuln-suite",
    title: "Web Vulnerability Suite",
    subsection: "security",
    subsectionIndex: 1,
    latitude: 8.9021,
    longitude: 116.7198,
  },
  {
    id: "webdev-ai-curriculum-mapper",
    title: "AI Curriculum Mapper",
    subsection: "webDev",
    subsectionIndex: 0,
    latitude: 0.3521,
    longitude: 120.1198,
  },
  {
    id: "webdev-huskender",
    title: "Huskender",
    subsection: "webDev",
    subsectionIndex: 1,
    latitude: 3.4721,
    longitude: 107.6198,
  },
  {
    id: "webdev-dev-exchange",
    title: "Dev Exchange",
    subsection: "webDev",
    subsectionIndex: 2,
    latitude: 12.1121,
    longitude: 122.1198,
  },
];

const projectMiniNodeProfiles: Record<string, ProjectMiniNodeProfile> = {
  "systems-wan-dht": {
    timeframe: "Fall 2025",
    role: "Systems Engineer",
    stack: ["Rust", "TLS/mTLS", "Distributed Systems", "Replication", "Consistent Hashing"],
    highlights: [
      "Implemented N=3 replication, hinted handoff replay, read-repair, anti-entropy, and tombstone garbage collection.",
      "Built failure-aware forwarding and read paths for dynamic peer membership.",
      "Added reproducible cluster validation scripts for routing correctness and node-failure recovery.",
    ],
    impact: "Validated high-availability behavior during node churn while preserving eventual convergence.",
    status: "Completed",
  },
  "systems-binary-exploitation": {
    timeframe: "Fall 2025",
    role: "Security Researcher",
    stack: ["Linux", "x86-64", "GDB", "Exploit Development"],
    highlights: [
      "Developed payloads for stack-based control-flow hijacking in hardened binaries.",
      "Traced calling conventions, stack layout, and return-address overwrite mechanics.",
      "Documented bypass strategies for modern mitigations as part of repeatable lab workflows.",
    ],
    impact: "Strengthened reverse-engineering and exploit-analysis skills for low-level security work.",
    status: "Completed",
  },
  "systems-secure-crawler": {
    timeframe: "Fall 2025",
    role: "Backend Developer",
    stack: ["Python", "TLS", "HTTP/HTTPS", "Session Management"],
    highlights: [
      "Built an authenticated crawler without external scraping libraries.",
      "Implemented manual chunked-transfer parsing and CSRF-aware navigation.",
      "Handled secure session persistence across multi-step login and traversal paths.",
    ],
    impact: "Delivered a standards-focused crawler foundation for security-oriented web scanning.",
    status: "Completed",
  },
  "security-crypto-analysis": {
    timeframe: "2025",
    role: "Applied Cryptography Analyst",
    stack: ["Python", "Protocol Analysis", "Traffic Inspection", "Signal Processing"],
    highlights: [
      "Reverse-engineered custom cryptographic message flows from captured traffic.",
      "Applied noise-recovery techniques to recover meaningful data from degraded channels.",
      "Produced attack notes that explain concrete weakness classes and exploit preconditions.",
    ],
    impact: "Converted theoretical crypto concepts into practical vulnerability assessment workflows.",
    status: "Completed",
  },
  "security-web-vuln-suite": {
    timeframe: "2025",
    role: "Offensive Security Builder",
    stack: ["JavaScript", "SQL", "HTTP", "OWASP Testing"],
    highlights: [
      "Executed SQL injection, XSS, and CSRF attack paths against simulated production targets.",
      "Mapped exploit chains from initial foothold through privilege or session abuse.",
      "Packaged findings in structured write-ups suitable for remediation handoff.",
    ],
    impact: "Created a practical suite for demonstrating web vulnerability classes end-to-end.",
    status: "Completed",
  },
  "webdev-ai-curriculum-mapper": {
    timeframe: "Feb 2026 - Present",
    role: "Research Assistant / Full-Stack Developer",
    stack: ["TypeScript", "React", "Data Visualization", "API Integration"],
    highlights: [
      "Designed curriculum graph views that surface prerequisites and competency gaps.",
      "Integrated frontend interactions with backend data pipelines for multi-dimensional datasets.",
      "Improved usability for institutional decision support and internal research sharing.",
    ],
    impact: "Expanded visibility into curriculum pathways for planning, analysis, and reporting.",
    status: "In progress",
  },
  "webdev-huskender": {
    timeframe: "Jan 2026",
    role: "Lead Developer",
    stack: ["Full-Stack Web", "Product Design", "Data Modeling", "Scheduling Logic"],
    highlights: [
      "Built student-first academic scheduling workflows from concept through deployment.",
      "Defined schema and planning logic for real-time schedule generation.",
      "Iterated interface flows for speed, clarity, and reduced planning friction.",
    ],
    impact: "Delivered a tailored scheduling tool when existing products did not fit the use case.",
    status: "Completed",
    links: [{ label: "Demo", href: "#" }],
  },
  "webdev-dev-exchange": {
    timeframe: "Nov 2025 - Jan 2026",
    role: "Full-Stack Contributor",
    stack: ["React", "Node.js", "UI Design", "Community Platform"],
    highlights: [
      "Built core flows for developer skill exchange and profile-based matching.",
      "Contributed visual identity and high-impact front-end interaction polish.",
      "Collaborated on product shaping, feedback loops, and launch preparation.",
    ],
    impact: "Established an MVP collaboration platform for peer-to-peer technical support.",
    status: "Completed",
    links: [{ label: "Repository", href: "#" }],
  },
};

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

export function getProjectMiniNodeProfile(id: string): ProjectMiniNodeProfile | null {
  return projectMiniNodeProfiles[id] ?? null;
}
