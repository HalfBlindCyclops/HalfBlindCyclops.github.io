import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sean Wetherell | LinkedIn",
  description:
    "Open Sean Wetherell’s LinkedIn profile, or stay and explore the interactive globe resume.",
};

export default function LinkedInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
