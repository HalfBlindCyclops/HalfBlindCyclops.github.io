"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  LINKEDIN_PROFILE_URL,
  PROFILE_DISPLAY_NAME,
  PROFILE_IMAGE_SRC,
  PROFILE_TAGLINE,
} from "@/data/profileHub";
import { ACCENT_COLOR_HEX, colorToRgba } from "@/lib/colorFormat";
import { SURFACE_SHELL_DARK } from "@/lib/uiSurfaces";

export default function LinkedInGatewayPage() {
  const accentSoft = colorToRgba(ACCENT_COLOR_HEX, 0.18);
  const accentBorder = colorToRgba(ACCENT_COLOR_HEX, 0.45);
  const accentStrong = colorToRgba(ACCENT_COLOR_HEX, 0.92);

  return (
    <main
      className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-5 py-10"
      style={{
        background: `
          radial-gradient(ellipse 80% 55% at 50% -10%, ${accentSoft}, transparent 55%),
          radial-gradient(ellipse 60% 40% at 80% 100%, rgba(15, 23, 42, 0.9), transparent 50%),
          #020617
        `,
      }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ duration: 1.2 }}
        style={{
          backgroundImage: `linear-gradient(${colorToRgba(ACCENT_COLOR_HEX, 0.06)} 1px, transparent 1px),
            linear-gradient(90deg, ${colorToRgba(ACCENT_COLOR_HEX, 0.06)} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent)",
        }}
        aria-hidden
      />

      <motion.section
        className={`relative z-10 w-full max-w-md p-[var(--surface-pad-md)] md:p-[var(--surface-pad-lg)] ${SURFACE_SHELL_DARK}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            className="relative mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/20"
            style={{
              background: `linear-gradient(to bottom right, ${accentSoft}, rgb(15 23 42))`,
              boxShadow: `0 0 0 1px ${accentBorder}, 0 0 28px ${colorToRgba(ACCENT_COLOR_HEX, 0.2)}`,
            }}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.45 }}
          >
            {PROFILE_IMAGE_SRC ? (
              // eslint-disable-next-line @next/next/no-img-element -- /public asset; static export uses img not next/image
              <img
                src={PROFILE_IMAGE_SRC}
                alt=""
                width={80}
                height={80}
                decoding="async"
                fetchPriority="high"
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className="text-lg font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-orbitron), sans-serif", color: accentStrong }}
                aria-hidden
              >
                SW
              </span>
            )}
          </motion.div>

          <h1
            className="text-2xl font-bold tracking-wide text-white md:text-3xl"
            style={{ fontFamily: "var(--font-orbitron), sans-serif" }}
          >
            {PROFILE_DISPLAY_NAME}
          </h1>
          <p className="mt-2 text-sm text-slate-400">{PROFILE_TAGLINE}</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
            Looking for my LinkedIn, or want to explore the interactive resume first?
          </p>
        </div>

        <motion.div
          className="mt-8 flex flex-col gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.45 }}
        >
          <a
            href={LINKEDIN_PROFILE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[#004182] bg-[#0A66C2] px-4 text-sm font-semibold tracking-wide text-white transition hover:bg-[#004182]"
            style={{
              boxShadow: "0 0 20px rgba(10, 102, 194, 0.35)",
            }}
          >
            Go to LinkedIn
          </a>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-white/40 bg-white/5 px-4 text-sm font-semibold tracking-wide text-slate-100 transition hover:border-white/55 hover:bg-white/10"
          >
            Stay and explore here
          </Link>
        </motion.div>
      </motion.section>
    </main>
  );
}
