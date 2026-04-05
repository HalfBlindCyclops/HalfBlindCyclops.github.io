"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ResumeNode } from "@/data/resumeNodes";

const bulletLeadClass =
  "text-lg font-semibold leading-snug tracking-tight text-white md:text-xl md:leading-snug";
const bulletDetailClass =
  "text-base leading-7 text-slate-200 md:text-[1.05rem] md:leading-8";

function StructuredBullet({
  bullet,
  index,
}: {
  bullet: string;
  index: number;
}) {
  const colon = bullet.indexOf(": ");
  if (colon > 0 && colon < bullet.length - 2) {
    const head = bullet.slice(0, colon);
    const tail = bullet.slice(colon + 2);
    return (
      <motion.li
        className="flex items-start gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 + index * 0.06, duration: 0.24 }}
      >
        <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
        <div className="min-w-0 flex-1">
          <p className={bulletLeadClass}>{head}</p>
          <p className={`mt-2 ${bulletDetailClass}`}>{tail}</p>
        </div>
      </motion.li>
    );
  }
  return (
    <motion.li
      className="flex items-start gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06, duration: 0.24 }}
    >
      <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
      <span className={bulletDetailClass}>{bullet}</span>
    </motion.li>
  );
}

type ResumePanelProps = {
  node: ResumeNode | null;
  onClose: () => void;
  /** Advance to the following resume section (e.g. circular order). */
  onGoToNext?: () => void;
  /** Label for the next section; used for the Next control and accessibility. */
  nextSectionTitle?: string;
  isSplitView?: boolean;
  /** Horizontal connector line Y (percent), e.g. `"42%"`. */
  streamStartY?: string;
  /** Panel top in split view; default places content below the horizontal line. */
  splitViewPanelTop?: string;
  /** Anchor left edge just past the horizontal connector line end. */
  splitViewPanelLeft?: string;
  /** Max width so the panel fits the remaining viewport. */
  splitViewPanelWidth?: string;
};

export function ResumePanel({
  node,
  onClose,
  onGoToNext,
  nextSectionTitle,
  isSplitView = false,
  streamStartY = "50%",
  splitViewPanelTop,
  splitViewPanelLeft,
  splitViewPanelWidth,
}: ResumePanelProps) {
  const splitTop = splitViewPanelTop ?? `calc(${streamStartY} + 1rem)`;
  const splitAnchored =
    Boolean(isSplitView && splitViewPanelLeft && splitViewPanelWidth);
  const splitStyle = splitAnchored
    ? { left: splitViewPanelLeft, top: splitTop, width: splitViewPanelWidth, right: "auto" as const }
    : isSplitView
      ? { right: "2.75rem", top: splitTop }
      : undefined;
  const asideClass =
    "pointer-events-auto absolute z-50 rounded-2xl border border-white/20 bg-white/10 text-slate-100 shadow-2xl shadow-cyan-900/30 backdrop-blur-xl " +
    "left-1/2 w-[min(92vw,30rem)] -translate-x-1/2 p-6 max-h-[min(calc(100dvh-6rem),90dvh)] overflow-y-auto " +
    "top-[max(5.5rem,8dvh)] -translate-y-0 sm:top-[max(6rem,10dvh)] " +
    "md:top-auto md:max-h-[min(88vh,calc(100dvh-5rem))] md:translate-x-0 md:translate-y-0 md:overflow-y-auto md:p-8 " +
    (splitAnchored
      ? "md:left-auto md:top-auto md:w-auto"
      : "md:left-auto md:w-[36rem] md:max-w-[min(36rem,calc(100vw-3rem))] " +
        (isSplitView ? "md:right-[2.75rem]" : ""));
  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          className={asideClass}
          style={splitStyle ?? undefined}
          initial={
            isSplitView
              ? { opacity: 0, x: 120, y: -12, clipPath: "inset(0 100% 0 0 round 1rem)" }
              : { opacity: 0, y: 18, scale: 0.98 }
          }
          animate={
            isSplitView
              ? { opacity: 1, x: 0, y: 0, clipPath: "inset(0 0% 0 0 round 1rem)" }
              : { opacity: 1, y: 0, scale: 1 }
          }
          exit={
            isSplitView
              ? { opacity: 0, x: 80, y: -8, clipPath: "inset(0 100% 0 0 round 1rem)" }
              : { opacity: 0, y: 14, scale: 0.98 }
          }
          transition={{ duration: 0.42, delay: 0.12, ease: "easeOut" }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                  {node.title}
                </h2>
                {onGoToNext ? (
                  <button
                    type="button"
                    onClick={onGoToNext}
                    aria-label={
                      nextSectionTitle
                        ? `Go to next section: ${nextSectionTitle}`
                        : "Go to next section"
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-200/45 bg-cyan-300/10 px-3.5 py-1.5 text-sm font-medium tracking-wide text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-200/15 md:text-[0.9375rem]"
                  >
                    Next
                    <span aria-hidden className="text-cyan-200/90">
                      →
                    </span>
                  </button>
                ) : null}
              </div>
              {node.subtitle.trim() ? (
                <p className="mt-3 text-base leading-relaxed text-slate-300 md:text-lg">
                  {node.subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close section"
              onClick={onClose}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg leading-none text-slate-100 transition hover:bg-white/20"
            >
              ×
            </button>
          </div>
          <ul className="space-y-5 md:space-y-6">
            {node.bullets.map((bullet, index) =>
              node.id === "experience" || node.id === "projects" ? (
                <StructuredBullet key={bullet} bullet={bullet} index={index} />
              ) : (
                <motion.li
                  key={bullet}
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + index * 0.06, duration: 0.24 }}
                >
                  <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
                  <span className={bulletDetailClass}>{bullet}</span>
                </motion.li>
              ),
            )}
          </ul>
          {node.links && node.links.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {node.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith("http") ? "_blank" : undefined}
                  rel={link.href.startsWith("http") ? "noreferrer noopener" : undefined}
                  className="rounded-full border border-cyan-200/45 bg-cyan-300/10 px-5 py-2.5 text-sm font-medium tracking-wide text-cyan-100 transition hover:bg-cyan-200/20"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
