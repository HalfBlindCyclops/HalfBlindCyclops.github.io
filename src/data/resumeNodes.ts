import { publicPath } from "@/lib/basePath";

/** Projects panel only: grouped bullets by area. */
export type ResumeProjectSubsections = {
  webDev: string[];
  systems: string[];
  security: string[];
  others: string[];
};

export type ResumeNode = {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  color: string;
  /** `mapPin` = teardrop pushpin. `orbital` = legacy tall antenna. Default / `uplinkPad` = ground-station pad + emitter. */
  markerStyle?: "orbital" | "mapPin" | "uplinkPad";
  bullets: string[];
  /** When set, the Projects panel renders these groups instead of `bullets`. */
  projectSubsections?: ResumeProjectSubsections;
  links?: Array<{
    label: string;
    href: string;
  }>;
};

export const resumeNodes: ResumeNode[] = [
  {
    id: "about",
    title: "About",
    subtitle: "Sean Wetherell — CS @ Northeastern · Boston, MA",
    /** Globe pin: Northeast (Boston / Northeastern). */
    latitude: 42.3399,
    longitude: -71.0892,
    color: "#22d3ee",
    markerStyle: "uplinkPad",
    bullets: [
      "People come first for me—relationships and teamwork are what I lean on most. I’m looking for a long-term team that cares about the same things I do.",
      "B.S. in Computer Science at Northeastern (Jan 2021 – May 2026), expected GPA 3.7. Coursework in algorithms, systems, networking, distributed systems, and security.",
      "Outside the keyboard: orbital mechanics, aerospace, and aviation; AWS Solutions Architect (SAA-C03) planned May 2026. Northeastern Club Wrestling; former four-year Norwood High varsity wrestler.",
    ],
    links: [
      { label: "Email", href: "mailto:Wetherell.S@Northeastern.edu" },
      { label: "Phone", href: "tel:+17818001653" },
      { label: "University", href: "https://www.northeastern.edu/" },
      { label: "Resume PDF", href: publicPath("/sean-wetherell-resume.pdf") },
    ],
  },
  {
    id: "experience",
    title: "Experience",
    subtitle: "Research, media, consulting, and earlier roles",
    /** Globe pin: Greenland (visual spread on the map; roles are mostly Boston-based). */
    latitude: 61,
    longitude: -103,
    color: "#38bdf8",
    markerStyle: "uplinkPad",
    bullets: [
      "Center for Inclusive Computing — Research Assistant (Jan 2026 – Present), Boston: CS research via curriculum analysis and data visualization; redesigning internal web assets for findings and institutional tracking.",
      "Startup — Consultant (Nov 2024 – Apr 2025), Boston: strategic support through acquisition; technical and process alignment for integration with the parent company.",
      "Boston Globe Media — IT Analyst (Jan 2024 – Sep 2024), Boston: remote management for weather modeling systems; AI-driven workflow automation for operations; executive support and enterprise tooling across Active Directory, Jamf, Sophos, and Jira.",
      "Vita Needle Co. — Precision Manufacturing Technician (Apr 2023 – Sep 2023), Newton: micrometer-scale parts, inventory and machining; high-priority tracking for $500K+ orders.",
      "**Boston’s Best Chimney** — Mason Assistant (Jun 2022 – Sep 2022).",
      "**Northeastern University** — Athletic Facilities Coordinator (Apr 2021 – Jan 2022).",
      "**Elaine Construction** — Construction Laborer (May 2020 – Apr 2021).",
    ],
  },
  {
    id: "projects",
    title: "Projects",
    subtitle: "",
    /** Globe pin: South-Central (Austin, TX) — visual spread on the map. */
    latitude: 34,
    longitude: -140,
    color: "#2dd4bf",
    markerStyle: "uplinkPad",
    bullets: [],
    projectSubsections: {
      webDev: [
        "Center for Inclusive Computing, Research Assistant (Feb 2026 – Present): research-backed platform to map and visualize AI curricula across programs; frontend/backend integration for multi-dimensional datasets, interactive graphs for prerequisites and competency gaps, and organizational decision support.",
        "Huskender — Lead Developer (Jan 2026): full-stack scheduling product from concept to deployment, built where off-the-shelf tools fell short for students; database schema design, real-time academic planning, and UX optimized for a student-centric workflow.",
        "Dev Exchange — Full-Stack Contributor (Nov 2025 – Jan 2026): technical expertise exchange platform; visual identity and front-end.",
      ],
      systems: [
        "Distributed Hash Map (Rust): built a fault-tolerant key-value store over a dynamic peer-to-peer cluster using consistent hashing on a 32-bit ring, 50 virtual nodes per machine, and N=3 replication (primary plus two replicas). Implemented server-side forwarding, failure-aware read paths, versioned tombstones, and repair loops (hinted handoff replay, read-repair, anti-entropy, tombstone GC) to preserve availability and convergence during failures and rejoin events. Secured all RPC traffic with TLS/mTLS and added reproducible cluster evaluation scripts for end-to-end routing, fault tolerance, and security validation.",
        "Memory corruption & binary exploitation (hardened Linux / warhead): buffer-overflow payloads to hijack control flow and reach arbitrary code execution; stack frames, return addresses, and bypasses for modern OS protections.",
        "Custom Secure Web Crawler (Python stdlib): HTTP/HTTPS crawler without requests or BeautifulSoup—manual TLS handshakes, chunked transfer parsing, session persistence, and CSRF-aware authenticated navigation.",
      ],
      security: [
        "Cryptographic protocol analysis & noise recovery: reverse-engineered custom or proprietary crypto protocols, applied noise-recovery techniques, and broke non-trivial encrypted channels to validate weaknesses in real implementations.",
        "Web application vulnerability suite: hands-on OWASP-style attacks on simulated production targets—SQLi for auth bypass and database access, XSS for session hijack, and CSRF for unauthorized actions on behalf of users.",
      ],
      others: [],
    },
  },
];

/** Default camera framing on load and after closing a node (About pin / Northeastern). */
export const INITIAL_GLOBE_FOCUS: { latitude: number; longitude: number } = (() => {
  const n = resumeNodes.find((r) => r.id === "about");
  if (!n) throw new Error("Missing about resume node");
  return { latitude: n.latitude, longitude: n.longitude };
})();
