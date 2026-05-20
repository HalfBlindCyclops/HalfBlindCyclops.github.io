"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { motionDuration, motionEase } from "@/lib/motion";

function GlobeExperienceShell() {
  return (
    <section
      className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_42%,_#01040f_100%)]"
      aria-busy="true"
      aria-label="Loading interactive experience"
    >
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: motionDuration.medium, ease: motionEase.smoothOut }}
      >
        <div className="w-[min(16rem,60vw)] space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.36em] text-slate-400">Loading globe</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <motion.div
              className="h-full rounded-full bg-cyan-300/70"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{
                duration: motionDuration.slow * 2.4,
                repeat: Infinity,
                ease: motionEase.smoothInOut,
              }}
            />
          </div>
        </div>
      </motion.div>
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
