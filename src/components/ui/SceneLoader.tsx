"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useProgress } from "@react-three/drei";

export function SceneLoader() {
  const { progress, active } = useProgress();

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <p className="mb-3 text-xs uppercase tracking-[0.36em] text-slate-300">
            Loading Earth Assets
          </p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/20">
            <motion.div
              className="h-full rounded-full bg-cyan-300"
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-400">{Math.round(progress)}%</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
