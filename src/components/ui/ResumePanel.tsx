"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { getProjectMiniNodeId } from "@/data/projectMiniNodes";
import type { ResumeNode, ResumeProjectSubsections } from "@/data/resumeNodes";
import { ACCENT_COLOR_HEX, colorToRgba } from "@/lib/colorFormat";

const bulletLeadClass =
  "text-lg font-semibold leading-snug tracking-tight text-white md:text-xl md:leading-snug";
const bulletDetailClass =
  "text-base leading-7 text-slate-200 md:text-[1.05rem] md:leading-8";
/** Slightly larger body copy for About only. */
const aboutDetailClass =
  "text-[1.0625rem] leading-7 text-slate-200 md:text-[1.125rem] md:leading-8";

function renderInlineBold(text: string): ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function StructuredBullet({
  bullet,
  index,
  onClick,
  isActive = false,
  bulletIndex,
}: {
  bullet: string;
  index: number;
  onClick?: () => void;
  isActive?: boolean;
  bulletIndex?: number;
}) {
  const clickable = Boolean(onClick);
  const itemClassName = clickable
    ? "group w-full rounded-xl border px-3 py-2 text-left transition hover:border-white/35 hover:bg-white/5"
    : "";
  const itemStyle = clickable
    ? isActive
      ? {
          borderColor: colorToRgba(ACCENT_COLOR_HEX, 0.58),
          backgroundColor: colorToRgba(ACCENT_COLOR_HEX, 0.12),
        }
      : {
          borderColor: "rgba(148, 163, 184, 0.28)",
          backgroundColor: "rgba(15, 23, 42, 0.28)",
        }
    : undefined;
  const dotStyle = {
    backgroundColor: ACCENT_COLOR_HEX,
    boxShadow: clickable && isActive ? `0 0 10px ${colorToRgba(ACCENT_COLOR_HEX, 0.55)}` : "none",
  };

  const colon = bullet.indexOf(": ");
  if (colon > 0 && colon < bullet.length - 2) {
    const head = bullet.slice(0, colon);
    const tail = bullet.slice(colon + 2);
    return (
      <motion.li
        className="flex items-start gap-3"
        data-bullet-index={bulletIndex}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 + index * 0.06, duration: 0.24 }}
      >
        {clickable ? (
          <button type="button" onClick={onClick} className={itemClassName} style={itemStyle}>
            <div className="flex items-start gap-3">
              <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={dotStyle} />
              <div className="min-w-0 flex-1">
                <p className={bulletLeadClass}>{head}</p>
                <p className={`mt-2 ${bulletDetailClass}`}>{renderInlineBold(tail)}</p>
              </div>
            </div>
          </button>
        ) : (
          <>
            <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={dotStyle} />
            <div className="min-w-0 flex-1">
              <p className={bulletLeadClass}>{head}</p>
              <p className={`mt-2 ${bulletDetailClass}`}>{renderInlineBold(tail)}</p>
            </div>
          </>
        )}
      </motion.li>
    );
  }
  return (
    <motion.li
      className="flex items-start gap-3"
      data-bullet-index={bulletIndex}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06, duration: 0.24 }}
    >
      {clickable ? (
        <button type="button" onClick={onClick} className={itemClassName} style={itemStyle}>
          <div className="flex items-start gap-3">
            <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={dotStyle} />
            <span className={bulletDetailClass}>{renderInlineBold(bullet)}</span>
          </div>
        </button>
      ) : (
        <>
          <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full" style={dotStyle} />
          <span className={bulletDetailClass}>{renderInlineBold(bullet)}</span>
        </>
      )}
    </motion.li>
  );
}

const PROJECT_SUBSECTION_LABELS: Record<keyof ResumeProjectSubsections, string> = {
  webDev: "Web dev",
  systems: "Systems",
  security: "Security",
  others: "Others",
};

const PROJECT_SUBSECTION_ORDER: (keyof ResumeProjectSubsections)[] = [
  "systems",
  "security",
  "others",
  "webDev",
];

/** Down chevron at bottom of Projects when content extends below the fold. */
function ProjectsScrollDownCue() {
  return (
    <div
      className="pointer-events-none flex flex-col items-center"
      style={{ color: ACCENT_COLOR_HEX }}
      aria-hidden
    >
      <svg
        className="h-5 w-5 animate-bounce opacity-90 md:h-6 md:w-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

function ProjectSubsectionsList({
  subsections,
  activeProjectMiniNodeId,
  onSelectProjectMiniNode,
}: {
  subsections: ResumeProjectSubsections;
  activeProjectMiniNodeId: string | null;
  onSelectProjectMiniNode?: (miniNodeId: string) => void;
}) {
  const groups = PROJECT_SUBSECTION_ORDER.map((key) => ({
    key,
    title: PROJECT_SUBSECTION_LABELS[key],
    bullets: subsections[key],
  })).filter((g) => g.bullets.length > 0);

  return (
    <div className="space-y-8 md:space-y-9">
      {groups.map((group, groupIndex) => (
        <section key={group.title} aria-labelledby={`project-sub-${groupIndex}`}>
          <h3
            id={`project-sub-${groupIndex}`}
            className="text-xl font-semibold tracking-tight text-white md:text-2xl"
          >
            {group.title}
          </h3>
          <ul className="mt-4 space-y-5 md:mt-5 md:space-y-6">
            {group.bullets.map((bullet, index) => {
              const miniNodeId = getProjectMiniNodeId(group.key, index);
              return (
                <StructuredBullet
                  key={bullet}
                  bullet={bullet}
                  index={index}
                  onClick={
                    onSelectProjectMiniNode && miniNodeId
                      ? () => onSelectProjectMiniNode(miniNodeId)
                      : undefined
                  }
                  isActive={activeProjectMiniNodeId !== null && activeProjectMiniNodeId === miniNodeId}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
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
  /** Center split-view panel on `splitViewPanelLeft` (e.g. `50%`). */
  splitViewPanelCenter?: boolean;
  activeProjectMiniNodeId?: string | null;
  onSelectProjectMiniNode?: (miniNodeId: string) => void;
  scrollToBulletIndex?: number | null;
  onDidScrollToBullet?: () => void;
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
  splitViewPanelCenter = false,
  activeProjectMiniNodeId = null,
  onSelectProjectMiniNode,
  scrollToBulletIndex = null,
  onDidScrollToBullet,
}: ResumePanelProps) {
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const [hasVerticalScroll, setHasVerticalScroll] = useState(false);
  const [showProjectsScrollCue, setShowProjectsScrollCue] = useState(false);

  const updateScrollMetrics = useCallback(() => {
    const el = scrollBodyRef.current;
    if (!el) {
      setHasVerticalScroll(false);
      setShowProjectsScrollCue(false);
      return;
    }
    const canScroll = el.scrollHeight > Math.ceil(el.clientHeight);
    setHasVerticalScroll(canScroll);
    if (node?.id === "projects" && canScroll) {
      const threshold = 16;
      const atBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
      setShowProjectsScrollCue(!atBottom);
    } else {
      setShowProjectsScrollCue(false);
    }
  }, [node?.id]);

  useLayoutEffect(() => {
    if (!node) {
      const id = requestAnimationFrame(() => {
        setHasVerticalScroll(false);
        setShowProjectsScrollCue(false);
      });
      return () => cancelAnimationFrame(id);
    }
    const el = scrollBodyRef.current;
    if (!el) {
      const id = requestAnimationFrame(() => {
        setHasVerticalScroll(false);
        setShowProjectsScrollCue(false);
      });
      return () => cancelAnimationFrame(id);
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      updateScrollMetrics();
      raf2 = requestAnimationFrame(updateScrollMetrics);
    });
    const ro = new ResizeObserver(() => updateScrollMetrics());
    ro.observe(el);
    el.addEventListener("scroll", updateScrollMetrics, { passive: true });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollMetrics);
    };
  }, [node, updateScrollMetrics]);

  useLayoutEffect(() => {
    if (!node || scrollToBulletIndex === null) return;
    const host = scrollBodyRef.current;
    if (!host) return;
    const target = host.querySelector<HTMLElement>(`[data-bullet-index="${scrollToBulletIndex}"]`);
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      onDidScrollToBullet?.();
    });
  }, [node, onDidScrollToBullet, scrollToBulletIndex]);

  const splitTop = splitViewPanelTop ?? `calc(${streamStartY} + 1rem)`;
  const splitAnchored =
    Boolean(isSplitView && splitViewPanelLeft && splitViewPanelWidth);
  const splitMaxHeight = `calc(100dvh - (${splitTop}) - 1rem)`;
  const splitStyle = splitAnchored
    ? {
        left: splitViewPanelLeft,
        top: splitTop,
        width: splitViewPanelWidth,
        right: "auto" as const,
        maxHeight: splitMaxHeight,
        transform: splitViewPanelCenter ? "translateX(-50%)" : undefined,
      }
    : isSplitView
      ? { right: "2.75rem", top: splitTop, maxHeight: splitMaxHeight }
      : undefined;
  const accentPanelShadow = `0 25px 50px -12px ${colorToRgba(ACCENT_COLOR_HEX, 0.12)}`;
  const scrollBodyAccent: CSSProperties | undefined = hasVerticalScroll
    ? { ["--resume-scroll-thumb" as string]: ACCENT_COLOR_HEX }
    : undefined;
  const asideClass =
    "pointer-events-auto absolute z-50 flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-slate-100 shadow-2xl backdrop-blur-xl min-h-0 " +
    "left-1/2 w-[min(92vw,30rem)] -translate-x-1/2 p-6 max-h-[min(calc(100dvh-6rem),90dvh)] " +
    "top-[max(5.5rem,8dvh)] -translate-y-0 sm:top-[max(6rem,10dvh)] " +
    "md:top-auto md:max-h-[min(88vh,calc(100dvh-5rem))] md:translate-x-0 md:translate-y-0 md:p-8 " +
    (splitAnchored
      ? "md:left-auto md:top-auto md:w-auto"
      : "md:left-auto md:w-[36rem] md:max-w-[min(36rem,calc(100vw-3rem))] " +
        (isSplitView ? "md:right-[2.75rem]" : ""));
  const asideStyle: CSSProperties = {
    ...(splitStyle
      ? { ...splitStyle, boxShadow: accentPanelShadow }
      : { boxShadow: accentPanelShadow }),
  };

  const scrollBodyClass =
    "min-h-0 flex-1 overflow-y-auto overscroll-y-contain " +
    (hasVerticalScroll ? "overflow-y-scroll resume-panel-scroll-accent " : "");
  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          className={asideClass}
          style={asideStyle}
          onAnimationComplete={updateScrollMetrics}
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
          <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:gap-x-6">
                <h2 className="text-4xl font-semibold leading-none tracking-tight text-white md:text-5xl">
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
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[0.9375rem] font-medium tracking-wide transition hover:brightness-110 md:px-5 md:py-2.5 md:text-base"
                    style={{
                      borderColor: colorToRgba(ACCENT_COLOR_HEX, 0.45),
                      backgroundColor: colorToRgba(ACCENT_COLOR_HEX, 0.1),
                      color: "rgb(236, 254, 255)",
                    }}
                  >
                    Next
                    <span
                      aria-hidden
                      className="text-base leading-none md:text-lg"
                      style={{ color: colorToRgba(ACCENT_COLOR_HEX, 0.9) }}
                    >
                      →
                    </span>
                  </button>
                ) : null}
              </div>
              {node.subtitle.trim() ? (
                <p
                  className={
                    node.id === "about"
                      ? "mt-3 text-lg leading-relaxed text-slate-300 md:text-xl"
                      : "mt-3 text-base leading-relaxed text-slate-300 md:text-lg"
                  }
                >
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
          <div className="relative min-h-0 flex flex-1 flex-col">
            <div
              ref={scrollBodyRef}
              className={scrollBodyClass}
              style={scrollBodyAccent}
            >
              {node.id === "projects" && node.projectSubsections ? (
                <ProjectSubsectionsList
                  subsections={node.projectSubsections}
                  activeProjectMiniNodeId={activeProjectMiniNodeId}
                  onSelectProjectMiniNode={onSelectProjectMiniNode}
                />
              ) : (
                <ul className="space-y-5 md:space-y-6">
                  {node.bullets.map((bullet, index) =>
                    node.id === "experience" || node.id === "projects" ? (
                      <StructuredBullet
                        key={bullet}
                        bullet={bullet}
                        index={index}
                        bulletIndex={index}
                      />
                    ) : (
                      <motion.li
                        key={bullet}
                        className="flex items-start gap-3"
                        data-bullet-index={index}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + index * 0.06, duration: 0.24 }}
                      >
                        <span
                          className="mt-2.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: ACCENT_COLOR_HEX }}
                        />
                        <span
                          className={node.id === "about" ? aboutDetailClass : bulletDetailClass}
                        >
                          {renderInlineBold(bullet)}
                        </span>
                      </motion.li>
                    ),
                  )}
                </ul>
              )}
              {node.links && node.links.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  {node.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noreferrer noopener" : undefined}
                      className="rounded-full border px-5 py-2.5 text-sm font-medium tracking-wide transition hover:brightness-110"
                      style={{
                        borderColor: colorToRgba(ACCENT_COLOR_HEX, 0.45),
                        backgroundColor: colorToRgba(ACCENT_COLOR_HEX, 0.1),
                        color: "rgb(236, 254, 255)",
                      }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            {node.id === "projects" && showProjectsScrollCue ? (
              <div className="pointer-events-none absolute bottom-2 left-1/2 z-[3] -translate-x-1/2 md:bottom-3">
                <ProjectsScrollDownCue />
              </div>
            ) : null}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
