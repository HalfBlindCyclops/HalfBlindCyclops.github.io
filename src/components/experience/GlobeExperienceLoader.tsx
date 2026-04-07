"use client";

import dynamic from "next/dynamic";

function GlobeExperienceShell() {
  return (
    <section
      className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_42%,_#01040f_100%)]"
      aria-busy="true"
      aria-label="Loading interactive experience"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-xs uppercase tracking-[0.36em] text-slate-500">Loading…</p>
      </div>
    </section>
  );
}

const GlobeExperience = dynamic(
  () =>
    import("@/components/experience/GlobeExperience").then((m) => m.GlobeExperience),
  { ssr: false, loading: () => <GlobeExperienceShell /> },
);

export function GlobeExperienceLoader() {
  return <GlobeExperience />;
}
