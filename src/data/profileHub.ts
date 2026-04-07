import { publicPath } from "@/lib/basePath";

export type ProfileContactIcon = "map" | "mail" | "phone" | "link" | "file" | "school";

/** Plain rows (no menu, no links). */
export type ProfileHubStaticRow = {
  id: string;
  variant: "static";
  listLabel: string;
  detail?: string;
  icon: ProfileContactIcon;
};

/** Opens action menu: copy + mailto / tel / open as configured. */
export type ProfileHubInteractiveRow = {
  id: string;
  variant: "interactive";
  listLabel: string;
  icon: ProfileContactIcon;
  copyValue: string;
  mailtoHref?: string;
  telHref?: string;
  openHref?: string;
};

export type ProfileHubRow = ProfileHubStaticRow | ProfileHubInteractiveRow;

export const PROFILE_DISPLAY_NAME = "Sean Wetherell";
export const PROFILE_TAGLINE = "CS @ Northeastern University · Boston, MA";

/** Served from `/public/headshot.jpeg`. */
export const PROFILE_IMAGE_SRC: string | null = publicPath("/headshot.jpeg");

/** Order: Northeastern, degree, Boston, then PDF, phone, email (interactive). */
export const profileHubRows: ProfileHubRow[] = [
  {
    id: "university",
    variant: "static",
    listLabel: "Northeastern University",
    icon: "school",
  },
  {
    id: "degree",
    variant: "static",
    listLabel: "B.S. Computer Science",
    detail: "Jan 2021 – May 2026 · expected",
    icon: "school",
  },
  {
    id: "location",
    variant: "static",
    listLabel: "Boston, MA",
    detail: "170 Hillside Street, 02120",
    icon: "map",
  },
  {
    id: "resume",
    variant: "interactive",
    listLabel: "Resume PDF",
    icon: "file",
    copyValue: "",
    openHref: publicPath("/sean-wetherell-resume.pdf"),
  },
  {
    id: "phone",
    variant: "interactive",
    listLabel: "Phone",
    icon: "phone",
    copyValue: "+1 (781) 800-1653",
    telHref: "tel:+17818001653",
  },
  {
    id: "email",
    variant: "interactive",
    listLabel: "Email",
    icon: "mail",
    copyValue: "Wetherell.S@Northeastern.edu",
    mailtoHref: "mailto:Wetherell.S@Northeastern.edu",
  },
];
