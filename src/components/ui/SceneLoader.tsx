"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useProgress } from "@react-three/drei";
import { ACCENT_COLOR_HEX } from "@/lib/colorFormat";
import { motionDuration, motionEase } from "@/lib/motion";

export function SceneLoader() {
  const { progress, active } = useProgress();

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionDuration.xslow, ease: motionEase.smoothOut }}
        >
          <p className="mb-3 text-xs uppercase tracking-[0.36em] text-slate-300">
            Loading Earth Assets
          </p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/20">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: ACCENT_COLOR_HEX }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: motionDuration.medium, ease: motionEase.smoothOut }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-400">{Math.round(progress)}%</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
