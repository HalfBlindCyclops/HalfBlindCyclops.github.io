import { publicPath } from "@/lib/basePath";

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
    markerStyle: "mapPin",
    bullets: [
      "People come first for me—relationships and teamwork are what I lean on most. I’m looking for a long-term team that cares about the same things I do.",
      "B.S. in Computer Science at Northeastern (Jan 2021 – May 2026), expected GPA 3.7. Coursework in algorithms, systems, networking, distributed systems, and security.",
      "170 Hillside Street, Boston, MA 02120.",
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
    /** Globe pin: Midwest (Chicago) — visual spread on the map; roles are mostly Boston-based. */
    latitude: 41.8781,
    longitude: -87.6298,
    color: "#38bdf8",
    markerStyle: "mapPin",
    bullets: [
      "Center for Inclusive Computing — Research Assistant (Jan 2026 – Present), Boston: CS research via curriculum analysis and data visualization; redesigning internal web assets for findings and institutional tracking.",
      "Startup — Consultant (Nov 2024 – Apr 2025), Boston: strategic support through acquisition; technical and process alignment for integration with the parent company.",
      "Boston Globe Media — IT Analyst (Jan 2024 – Sep 2024), Boston: remote management for weather modeling systems; AI-driven workflow automation for operations.",
      "Vita Needle Co. — Precision Manufacturing Technician (Apr 2023 – Sep 2023), Newton: micrometer-scale parts, inventory and machining; high-priority tracking for $500K+ orders.",
      "Boston’s Best Chimney — Mason Assistant (Jun 2022 – Sep 2022).",
      "Northeastern University — Athletic Facilities Coordinator (Apr 2021 – Jan 2022).",
      "Elaine Construction — Construction Laborer (May 2020 – Apr 2021).",
    ],
  },
  {
    id: "projects",
    title: "Projects",
    subtitle: "",
    /** Globe pin: South-Central (Austin, TX) — visual spread on the map. */
    latitude: 30.2672,
    longitude: -97.7431,
    color: "#2dd4bf",
    markerStyle: "mapPin",
    bullets: [
      "AI Curriculum Mapping & Visualization (Feb 2026 – Present): visualization platform mapping AI curricula across programs; interactive graphs for prerequisites and competency gaps.",
      "Huskender — Lead Developer (Jan 2026): full-stack scheduling site for gaps in student tools; custom UI/UX and real-time academic planning.",
      "Dev Exchange — Full-Stack Contributor (Nov 2025 – Jan 2026): technical expertise exchange platform; visual identity and front-end.",
    ],
  },
];

/** Default camera framing on load and after closing a node (About pin / Northeastern). */
export const INITIAL_GLOBE_FOCUS: { latitude: number; longitude: number } = (() => {
  const n = resumeNodes.find((r) => r.id === "about");
  if (!n) throw new Error("Missing about resume node");
  return { latitude: n.latitude, longitude: n.longitude };
})();
