"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import {
  ACESFilmicToneMapping,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Atmosphere } from "@/components/three/Atmosphere";
import { CameraRig } from "@/components/three/CameraRig";
import { Globe } from "@/components/three/Globe";
import { GlobeNodes } from "@/components/three/GlobeNodes";
import { OrbitalSatellites } from "@/components/three/OrbitalSatellites";
import { GlobeWeather } from "@/components/three/GlobeWeather";
import { SpaceBackground } from "@/components/three/SpaceBackground";
import { RuntimePerfMonitor } from "@/components/diagnostics/RuntimePerfMonitor";
import {
  JUNCTION_X,
  ResumeConnector,
} from "@/components/ui/ResumeConnector";
import { getProjectMiniNodeProfile, projectMiniNodes } from "@/data/projectMiniNodes";
import { INITIAL_GLOBE_FOCUS, resumeNodes, type ResumeNode } from "@/data/resumeNodes";
import { ACCENT_COLOR_HEX, colorToRgba } from "@/lib/colorFormat";
import { miniBulletParts } from "@/lib/projectBullet";
import type { ResumePanelAnchor, ResumeProjectDetail } from "@/components/ui/ResumePanel";
import { connectorMotion, motionDuration, motionEase } from "@/lib/motion";
import {
  SURFACE_INSET,
  SURFACE_PILL_BUTTON,
  SURFACE_SHELL_LIGHT,
} from "@/lib/uiSurfaces";
import {
  getFrameOverlaySnapshot,
  setConnectorAnchor as setConnectorAnchorStore,
  setCursorLatLon as setCursorLatLonStore,
  subscribeFrameOverlay,
  type ConnectorAnchor,
  type CursorLatLon,
} from "@/lib/frameOverlayStore";
import { useCanvasScreenRect } from "@/lib/useCanvasScreenRect";
import {
  GLOBE_GROUP_Y_ROTATION,
  LONGITUDE_ALIGNMENT_OFFSET_DEG,
  latLonToSceneWorld,
  sunDirectionForDate,
} from "@/lib/geo";

/** Horizontal beam + SVG junction. Panel anchors after line end. */
const CONNECTOR_BAR_LEFT_PCT = JUNCTION_X;
/** Short stub from junction — panel starts just after this for maximum text width. */
const CONNECTOR_BAR_WIDTH_PCT = 13;
const CONNECTOR_LINE_END_PCT = CONNECTOR_BAR_LEFT_PCT + CONNECTOR_BAR_WIDTH_PCT;
type SceneMode = "idle" | "focusing" | "focused" | "returning";

type MiniDetailInfo = {
  title: string;
  groupLabel: string;
  summary: string;
  details: string;
  chips?: string[];
  highlights?: string[];
  impact?: string;
  status?: string;
  links?: Array<{
    label: string;
    href: string;
  }>;
};

const PROJECT_SUBSECTION_LABELS = {
  webDev: "Web dev",
  systems: "Systems",
  security: "Security",
  others: "Other",
} as const;

const CONNECTOR_ANCHOR_HIDDEN_KEY = "__hidden__";
const ProfileContactHub = dynamic(
  () => import("@/components/ui/ProfileContactHub").then((m) => m.ProfileContactHub),
  { loading: () => null },
);
const ResumePanel = dynamic(
  () => import("@/components/ui/ResumePanel").then((m) => m.ResumePanel),
  { loading: () => null },
);
const SceneLoader = dynamic(
  () => import("@/components/ui/SceneLoader").then((m) => m.SceneLoader),
  { loading: () => null },
);

function ConnectorAnchorTracker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (anchor: ConnectorAnchor) => void;
}) {
  const { camera, gl, size } = useThree();
  const worldPointRef = useRef(new Vector3());
  const ndcPointRef = useRef(new Vector3());
  const camForwardRef = useRef(new Vector3());
  const toPointRef = useRef(new Vector3());
  const lastEmitKeyRef = useRef("");
  const canvasRectRef = useCanvasScreenRect(gl);

  useFrame(() => {
    const worldPoint = worldPointRef.current;
    const ndcPoint = ndcPointRef.current;
    const camForward = camForwardRef.current;
    const toPoint = toPointRef.current;

    if (latitude === null || longitude === null) {
      if (lastEmitKeyRef.current !== CONNECTOR_ANCHOR_HIDDEN_KEY) {
        lastEmitKeyRef.current = CONNECTOR_ANCHOR_HIDDEN_KEY;
        onChange({ xPercent: 0, yPercent: 0, visible: false });
      }
      return;
    }

    // Match uplink emitter core (GlobeNodes: surface 1.03 + ~0.0245 * scale along normal).
    worldPoint.copy(latLonToSceneWorld(latitude, longitude, 1.0623));
    ndcPoint.copy(worldPoint).project(camera);
    camera.getWorldDirection(camForward);

    toPoint.copy(worldPoint).sub(camera.position).normalize();
    const inFront = camForward.dot(toPoint) > 0;

    const rect = canvasRectRef.current;
    if (!rect || rect.width <= 0) {
      if (lastEmitKeyRef.current !== CONNECTOR_ANCHOR_HIDDEN_KEY) {
        lastEmitKeyRef.current = CONNECTOR_ANCHOR_HIDDEN_KEY;
        onChange({ xPercent: 0, yPercent: 0, visible: false });
      }
      return;
    }

    // Full-viewport canvas: map NDC → canvas pixels → viewport % for connector pin.
    const px = (ndcPoint.x * 0.5 + 0.5) * size.width;
    const py = (ndcPoint.y * -0.5 + 0.5) * size.height;
    const screenX = rect.left + px;
    const screenY = rect.top + py;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1;
    const xPercent = Math.max(0, Math.min(100, (screenX / vw) * 100));
    const yPercent = Math.max(0, Math.min(100, (screenY / vh) * 100));

    const next: ConnectorAnchor = {
      xPercent,
      yPercent,
      visible: inFront,
    };

    const key = `${Math.round(next.xPercent * 10)}:${Math.round(next.yPercent * 10)}:${next.visible ? 1 : 0}`;
    if (key !== lastEmitKeyRef.current) {
      lastEmitKeyRef.current = key;
      onChange(next);
    }
  });

  return null;
}

const MOBILE_LAYOUT_MQ = "(max-width: 767px)";

function subscribeMobileLayout(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMobileLayoutSnapshot() {
  return window.matchMedia(MOBILE_LAYOUT_MQ).matches;
}

/**
 * Split vs stacked layout drives camera distance and `setViewOffset`. `useSyncExternalStore` reads
 * `matchMedia` on the first client paint (no `useEffect` frame of false → wrong desktop framing).
 */
function useMobileLayout() {
  return useSyncExternalStore(
    subscribeMobileLayout,
    getMobileLayoutSnapshot,
    () => false,
  );
}

const CURSOR_COORDS_MISS = "__miss__";

function CursorLatLonTracker({
  onChange,
}: {
  onChange: (next: CursorLatLon) => void;
}) {
  const { camera, gl } = useThree();
  const canvasRectRef = useCanvasScreenRect(gl);
  const pointerRef = useRef(new Vector2(2, 2));
  const rayRef = useRef(new Raycaster());
  const hitRef = useRef(new Vector3());
  const prevKeyRef = useRef<string>(CURSOR_COORDS_MISS);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const rect = canvasRectRef.current;
      if (!rect || rect.width <= 0) return;
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerRef.current.set(x, y);
    };

    const onLeave = () => {
      pointerRef.current.set(2, 2);
      if (prevKeyRef.current !== CURSOR_COORDS_MISS) {
        prevKeyRef.current = CURSOR_COORDS_MISS;
        onChange({ latitude: null, longitude: null });
      }
    };

    gl.domElement.addEventListener("pointermove", onMove);
    gl.domElement.addEventListener("pointerleave", onLeave);
    return () => {
      gl.domElement.removeEventListener("pointermove", onMove);
      gl.domElement.removeEventListener("pointerleave", onLeave);
    };
  }, [canvasRectRef, gl, onChange]);

  useFrame(() => {
    const p = pointerRef.current;
    /** Pointer left canvas or invalid NDC — show N/A (red) instead of freezing last globe hit. */
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) {
      if (prevKeyRef.current !== CURSOR_COORDS_MISS) {
        prevKeyRef.current = CURSOR_COORDS_MISS;
        onChange({ latitude: null, longitude: null });
      }
      return;
    }

    const ray = rayRef.current;
    ray.setFromCamera(p, camera);
    const origin = ray.ray.origin;
    const dir = ray.ray.direction;

    const b = origin.dot(dir);
    const c = origin.lengthSq() - 1;
    const disc = b * b - c;
    if (disc < 0) {
      if (prevKeyRef.current !== CURSOR_COORDS_MISS) {
        prevKeyRef.current = CURSOR_COORDS_MISS;
        onChange({ latitude: null, longitude: null });
      }
      return;
    }

    const t = -b - Math.sqrt(disc);
    if (t <= 0) {
      if (prevKeyRef.current !== CURSOR_COORDS_MISS) {
        prevKeyRef.current = CURSOR_COORDS_MISS;
        onChange({ latitude: null, longitude: null });
      }
      return;
    }

    const hit = hitRef.current;
    hit.copy(origin).addScaledVector(dir, t);
    const cos = Math.cos(-GLOBE_GROUP_Y_ROTATION);
    const sin = Math.sin(-GLOBE_GROUP_Y_ROTATION);
    const localX = hit.x * cos + hit.z * sin;
    const localY = hit.y;
    const localZ = -hit.x * sin + hit.z * cos;
    const r = Math.hypot(localX, localY, localZ) || 1;

    const lat = (Math.asin(localY / r) * 180) / Math.PI;
    const lonPrime = (Math.atan2(-localZ, -localX) * 180) / Math.PI;
    let lon = lonPrime - LONGITUDE_ALIGNMENT_OFFSET_DEG;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const key = `${roundedLat}:${roundedLon}`;
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      onChange({ latitude: roundedLat, longitude: roundedLon });
    }
  });

  return null;
}

function MiniNodeDetailPanel({
  detail,
  onClose,
}: {
  detail: MiniDetailInfo;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.aside
        className={`pointer-events-auto absolute left-1/2 top-[max(5.5rem,8dvh)] z-50 w-[min(92vw,34rem)] -translate-x-1/2 p-[var(--surface-pad-md)] text-slate-100 md:left-auto md:right-[2.75rem] md:top-[max(7rem,11dvh)] md:w-[34rem] md:translate-x-0 md:p-[var(--surface-pad-lg)] ${SURFACE_SHELL_LIGHT}`}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: motionDuration.slow, ease: motionEase.smoothOut }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              {detail.groupLabel}
            </p>
            <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {detail.title}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close detail"
            onClick={onClose}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center text-lg leading-none text-slate-100 ${SURFACE_PILL_BUTTON}`}
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-lg font-semibold leading-snug text-white">{detail.summary}</p>
          <p className="text-base leading-7 text-slate-200 md:text-[1.05rem] md:leading-8">
            {detail.details}
          </p>
          {detail.chips && detail.chips.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {detail.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          {detail.highlights && detail.highlights.length > 0 ? (
            <div className={`space-y-2 p-4 ${SURFACE_INSET}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                Highlights
              </p>
              <ul className="space-y-1.5 text-sm leading-6 text-slate-200">
                {detail.highlights.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/80" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {detail.impact || detail.status ? (
            <div className={`grid gap-2 p-4 text-sm text-slate-200 ${SURFACE_INSET}`}>
              {detail.status ? (
                <p>
                  <span className="font-semibold text-white">Status:</span> {detail.status}
                </p>
              ) : null}
              {detail.impact ? (
                <p>
                  <span className="font-semibold text-white">Impact:</span> {detail.impact}
                </p>
              ) : null}
            </div>
          ) : null}
          {detail.links && detail.links.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {detail.links.map((link) => (
                <a
                  key={`${detail.title}-${link.label}`}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function CursorReadout() {
  const { cursor } = useSyncExternalStore(
    subscribeFrameOverlay,
    getFrameOverlaySnapshot,
    getFrameOverlaySnapshot,
  );
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-[52] flex max-w-[calc(100vw-2rem)] flex-col gap-3 md:bottom-8 md:left-8 md:max-w-[calc(100vw-4rem)]">
      <div className="w-[13.5rem] shrink-0 rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2 text-xs backdrop-blur-md md:text-sm">
        {cursor.latitude !== null && cursor.longitude !== null ? (
          <span style={{ color: ACCENT_COLOR_HEX }}>
            Lat {cursor.latitude.toFixed(2)}°, Lon {cursor.longitude.toFixed(2)}°
          </span>
        ) : (
          <span className="font-medium text-red-400">N/A</span>
        )}
      </div>
    </div>
  );
}

function ConnectorOverlay({
  selectedNode,
  showConnectorLine,
  connectorPathsActive,
  streamJunctionYPercent,
  streamStartY,
  connectorBarWidthPct,
  reducedMotion,
}: {
  selectedNode: ResumeNode | null;
  showConnectorLine: boolean;
  connectorPathsActive: boolean;
  streamJunctionYPercent: number;
  streamStartY: string;
  connectorBarWidthPct: number;
  reducedMotion: boolean;
}) {
  const { connector } = useSyncExternalStore(
    subscribeFrameOverlay,
    getFrameOverlaySnapshot,
    getFrameOverlaySnapshot,
  );

  return (
    <AnimatePresence>
      {selectedNode && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-20 hidden md:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionDuration.medium, ease: motionEase.smoothOut }}
        >
          <AnimatePresence>
            {showConnectorLine && connector.visible && (
              <ResumeConnector
                key="resume-connector"
                pinX={connector.xPercent}
                pinY={connector.yPercent}
                yJunction={streamJunctionYPercent}
                reducedMotion={reducedMotion}
                pathsActive
              />
            )}
          </AnimatePresence>
          <motion.div
            key={selectedNode.id}
            className="absolute h-[2px] rounded-full"
            style={{
              top: streamStartY,
              left: `${CONNECTOR_BAR_LEFT_PCT}%`,
              width: `${connectorBarWidthPct}%`,
              transformOrigin: "left center",
              backgroundColor: ACCENT_COLOR_HEX,
              boxShadow: `0 0 6px ${colorToRgba(ACCENT_COLOR_HEX, 0.5)}, 0 0 14px ${colorToRgba(ACCENT_COLOR_HEX, 0.25)}`,
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: showConnectorLine ? 1 : 0, opacity: showConnectorLine ? 1 : 0 }}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={{
              duration: connectorPathsActive
                ? connectorMotion.connect.duration
                : connectorMotion.retract.duration,
              ease: connectorPathsActive ? connectorMotion.connect.ease : connectorMotion.retract.ease,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GlobeExperience() {
  const PANEL_ANCHOR_EPSILON = 0.05;
  const [sunDirection, setSunDirection] = useState<[number, number, number]>(() =>
    sunDirectionForDate(new Date()),
  );
  const [selectedNode, setSelectedNode] = useState<ResumeNode | null>(null);
  const [activeProjectMiniNodeId, setActiveProjectMiniNodeId] = useState<string | null>(null);
  const [sceneMode, setSceneMode] = useState<SceneMode>("idle");
  const [resumePanelAnchor, setResumePanelAnchor] = useState<ResumePanelAnchor | null>(null);
  const handleResumePanelAnchorChange = useCallback((next: ResumePanelAnchor | null) => {
    setResumePanelAnchor((prev) => {
      if (prev === null && next === null) return prev;
      if (prev === null || next === null) return next;
      if (
        Math.abs(prev.leftPct - next.leftPct) < PANEL_ANCHOR_EPSILON &&
        Math.abs(prev.topPct - next.topPct) < PANEL_ANCHOR_EPSILON
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const sectionRef = useRef<HTMLElement | null>(null);
  const [sectionHeight, setSectionHeight] = useState(900);
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useMobileLayout();

  const activeNodeId = selectedNode?.id ?? null;
  const isProjectsSelected = selectedNode?.id === "projects";
  const isExperienceSelected = selectedNode?.id === "experience";
  const projectsNode = useMemo(() => resumeNodes.find((node) => node.id === "projects") ?? null, []);
  const activeProjectMiniNode =
    activeProjectMiniNodeId !== null
      ? projectMiniNodes.find((mini) => mini.id === activeProjectMiniNodeId) ?? null
      : null;
  const activeMiniDetail: MiniDetailInfo | null = useMemo(() => {
    if (isProjectsSelected && activeProjectMiniNode && projectsNode?.projectSubsections) {
      const profile = getProjectMiniNodeProfile(activeProjectMiniNode.id);
      const bullet =
        projectsNode.projectSubsections[activeProjectMiniNode.subsection][
          activeProjectMiniNode.subsectionIndex
        ] ?? "";
      const { summary, details } = miniBulletParts(bullet);
      const timeframe = profile?.timeframe?.trim() || "Timeline to be added";
      const role = profile?.role?.trim() || "Role details coming soon";
      const stack = profile?.stack?.filter(Boolean) ?? [];
      const highlights = (profile?.highlights?.filter(Boolean) ?? []).slice(0, 4);
      const impact = profile?.impact?.trim() || "Impact summary will be added soon.";
      const status = profile?.status?.trim() || "Status coming soon";
      return {
        title: activeProjectMiniNode.title,
        groupLabel: "Project detail",
        summary,
        details: details === summary ? "Additional implementation details coming soon." : details,
        chips: [timeframe, role, ...stack.slice(0, 4)],
        highlights:
          highlights.length > 0
            ? highlights
            : [
                "Detailed technical highlights are being documented.",
                "Key architecture and implementation notes will be added.",
              ],
        impact,
        status,
        links: profile?.links?.filter((link) => link.href && link.href !== "#"),
      };
    }
    return null;
  }, [activeProjectMiniNode, isProjectsSelected, projectsNode]);
  const showPanel =
    selectedNode !== null && (sceneMode === "focusing" || sceneMode === "focused")
      ? selectedNode
      : null;
  const activeProjectDetail: ResumeProjectDetail | null = useMemo(() => {
    if (!isProjectsSelected || !activeProjectMiniNode || !activeMiniDetail) return null;
    return {
      title: activeMiniDetail.title,
      summary: activeMiniDetail.summary,
      details: activeMiniDetail.details,
      chips: activeMiniDetail.chips,
      highlights: activeMiniDetail.highlights,
      impact: activeMiniDetail.impact,
      status: activeMiniDetail.status,
      links: activeMiniDetail.links?.filter((link) => link.href && link.href !== "#"),
    };
  }, [activeMiniDetail, activeProjectMiniNode, isProjectsSelected]);
  const activeProjectIndex =
    activeProjectMiniNodeId !== null
      ? projectMiniNodes.findIndex((node) => node.id === activeProjectMiniNodeId)
      : -1;
  const projectNavPosition =
    activeProjectIndex >= 0
      ? { current: activeProjectIndex + 1, total: projectMiniNodes.length }
      : undefined;
  const projectBreadcrumb = useMemo(() => {
    if (!isProjectsSelected || !activeProjectMiniNode) return null;
    const subsectionLabel = PROJECT_SUBSECTION_LABELS[activeProjectMiniNode.subsection] ?? "Project";
    return `Projects / ${subsectionLabel} / ${activeProjectMiniNode.title}`;
  }, [activeProjectMiniNode, isProjectsSelected]);
  const contextRibbon = useMemo(() => {
    if (!selectedNode) return null;
    if (isProjectsSelected) {
      if (activeProjectMiniNode) {
        return projectBreadcrumb;
      }
      return "Projects / Browse";
    }
    if (isExperienceSelected) {
      return "Experience";
    }
    return selectedNode.title;
  }, [activeProjectMiniNode, isExperienceSelected, isProjectsSelected, projectBreadcrumb, selectedNode]);
  const panelNextNode =
    showPanel === null
      ? null
      : resumeNodes[
          (resumeNodes.findIndex((n) => n.id === showPanel.id) + 1) % resumeNodes.length
        ];
  /** Two-phase switch: hide signal line first, then commit node swap next frame. */
  const [connectorPathsActive, setConnectorPathsActive] = useState(true);
  const switchRafRef = useRef<number | null>(null);
  /** Desktop: resume panel + connector overlay the right side; globe renders full-viewport (no canvas clip). */
  const isSplitView = !isMobile;
  /** Match split-view globe framing so top UI anchors to globe center. */
  const splitViewNavCenterX = "33%";
  const showConnectorLine =
    isSplitView &&
    selectedNode !== null &&
    sceneMode === "focused" &&
    connectorPathsActive;
  const connectorTargetLatLon = useMemo(() => {
    if (isProjectsSelected && activeProjectMiniNode) {
      return {
        latitude: activeProjectMiniNode.latitude,
        longitude: activeProjectMiniNode.longitude,
      };
    }
    if (selectedNode) {
      return {
        latitude: selectedNode.latitude,
        longitude: selectedNode.longitude,
      };
    }
    return { latitude: null, longitude: null };
  }, [
    activeProjectMiniNode,
    isProjectsSelected,
    selectedNode,
  ]);
  /** Lower % = higher on screen. Pin latitude when panel anchor is not yet measured. */
  const connectorTargetLatitude = connectorTargetLatLon.latitude;
  const pinStreamStartYPercent =
    connectorTargetLatitude !== null
      ? Math.max(12, Math.min(32, 26 - (connectorTargetLatitude / 90) * 18))
      : 22;
  const usePanelAnchoredConnector =
    isSplitView && resumePanelAnchor !== null && showPanel !== null;
  // Keep connector Y independent from panel anchor to avoid panel-position feedback loops.
  const streamStartYPercent = pinStreamStartYPercent;
  const streamStartY = `${streamStartYPercent}%`;
  const connectorBarWidthPct = usePanelAnchoredConnector
    ? Math.max(4, resumePanelAnchor.leftPct - CONNECTOR_BAR_LEFT_PCT)
    : CONNECTOR_BAR_WIDTH_PCT;
  const RESUME_PANEL_LIFT_PCT = 4;
  const resumePanelTopPercent = Math.max(10, streamStartYPercent - RESUME_PANEL_LIFT_PCT);
  const splitPanelBaseTop = `calc(${resumePanelTopPercent}% + 1rem)`;
  const useTallRightPanelLayout = isSplitView && (isProjectsSelected || isExperienceSelected);
  // Projects/Experience should occupy the right column from near the top nav, not the connector line.
  const splitPanelTop = useTallRightPanelLayout
    ? "max(6.75rem, 9dvh)"
    : `max(${splitPanelBaseTop}, 11rem)`;
  const splitPanelLeft = `calc(${CONNECTOR_LINE_END_PCT}% + 0.5rem)`;
  const splitPanelWidth = isProjectsSelected
    ? `min(58rem, calc(100% - ${CONNECTOR_LINE_END_PCT}% - 1.25rem))`
    : `min(52rem, calc(100% - ${CONNECTOR_LINE_END_PCT}% - 1.25rem))`;
  // Horizontal beam is h-[2px] with top at streamStartY — center is 1px lower (same coords as SVG viewBox %).
  const streamJunctionYPercent = Math.min(
    100,
    streamStartYPercent + (1 / Math.max(1, sectionHeight)) * 100,
  );

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setSectionHeight(el.clientHeight || 900));
    obs.observe(el);
    const id = requestAnimationFrame(() => setSectionHeight(el.clientHeight || 900));
    return () => {
      cancelAnimationFrame(id);
      obs.disconnect();
    };
  }, []);

  useEffect(
    () => () => {
      if (switchRafRef.current !== null) {
        cancelAnimationFrame(switchRafRef.current);
      }
    },
    [],
  );

  const onSelectNode = (node: ResumeNode) => {
    if (selectedNode?.id === node.id) return;

    if (selectedNode !== null) {
      // Phase 1: hide existing line immediately to avoid one-frame connector glitch.
      setConnectorPathsActive(false);
      if (switchRafRef.current !== null) cancelAnimationFrame(switchRafRef.current);
      // Phase 2: commit node change on next frame.
      switchRafRef.current = requestAnimationFrame(() => {
        setSelectedNode(node);
        if (node.id !== "projects") setActiveProjectMiniNodeId(null);
        setSceneMode("focusing");
      });
      return;
    }

    // Initial selection.
    setConnectorPathsActive(false);
    setSelectedNode(node);
    if (node.id !== "projects") setActiveProjectMiniNodeId(null);
    setSceneMode("focusing");
  };

  const onSelectProjectMiniNode = (miniNodeId: string) => {
    if (selectedNode?.id !== "projects") {
      const projectsNode = resumeNodes.find((node) => node.id === "projects");
      if (!projectsNode) return;
      setConnectorPathsActive(false);
      setSelectedNode(projectsNode);
      setSceneMode("focusing");
    } else {
      setSceneMode("focusing");
    }
    setActiveProjectMiniNodeId(miniNodeId);
  };

  const onClearProjectSelection = () => {
    setActiveProjectMiniNodeId(null);
    setSceneMode("focusing");
  };

  const onStepProject = (delta: -1 | 1) => {
    const total = projectMiniNodes.length;
    if (total === 0) return;
    const base =
      activeProjectIndex >= 0 ? activeProjectIndex : delta === 1 ? -1 : 0;
    const next = (base + delta + total) % total;
    onSelectProjectMiniNode(projectMiniNodes[next].id);
  };

  const onClosePanel = () => {
    setConnectorPathsActive(false);
    setResumePanelAnchor(null);
    setActiveProjectMiniNodeId(null);
    setSelectedNode(null);
    // Keep the current camera pose; only close UI overlays.
    setSceneMode("idle");
  };

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (
          target.isContentEditable ||
          tag === "input" ||
          tag === "textarea" ||
          tag === "select"
        ) {
          return;
        }
      }

      if (event.key === "Escape") {
        if (isProjectsSelected && activeProjectMiniNodeId) {
          event.preventDefault();
          onClearProjectSelection();
          return;
        }
        if (selectedNode) {
          event.preventDefault();
          onClosePanel();
        }
        return;
      }

      if (isProjectsSelected && selectedNode && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        onStepProject(event.key === "ArrowRight" ? 1 : -1);
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [
    activeProjectMiniNodeId,
    isProjectsSelected,
    onClearProjectSelection,
    onClosePanel,
    onStepProject,
    selectedNode,
  ]);

  const dprRange: [number, number] = prefersReducedMotion
    ? [1, 1.2]
    : isMobile
      ? [1, 1.2]
      : [1, 1.5];

  useEffect(() => {
    const refreshSunDirection = () => setSunDirection(sunDirectionForDate(new Date()));
    refreshSunDirection();
    const timer = window.setInterval(refreshSunDirection, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_42%,_#01040f_100%)]"
    >
      {/* Single WebGL context: sky + stars share the globe camera (parallax with orbit / focus). */}
      <div className="absolute inset-0 z-0">
        <Canvas
          className="block h-full w-full touch-none"
          dpr={dprRange}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
            outputColorSpace: SRGBColorSpace,
          }}
          camera={{ position: [0, 0.2, 21.5], fov: 44 }}
        >
          <Suspense fallback={null}>
            <SpaceBackground
              sunDirection={sunDirection}
              isMobile={isMobile}
              reducedMotion={Boolean(prefersReducedMotion)}
            />
            <group rotation={[0, GLOBE_GROUP_Y_ROTATION, 0]}>
              <Globe
                isMobile={isMobile}
                reducedMotion={Boolean(prefersReducedMotion)}
                sunDirection={sunDirection}
              />
              <GlobeWeather
                isMobile={isMobile}
                reducedMotion={Boolean(prefersReducedMotion)}
                sunDirection={sunDirection}
              />
              <Atmosphere
                sunDirection={sunDirection}
                isMobile={isMobile}
                reducedMotion={Boolean(prefersReducedMotion)}
              />
              <GlobeNodes
                activeNodeId={activeNodeId}
                activeProjectMiniNodeId={activeProjectMiniNodeId}
                activeExperienceMiniNodeId={null}
                showProjectMiniNodes
                showExperienceMiniNodes={false}
                reducedMotion={Boolean(prefersReducedMotion)}
                accentColor={ACCENT_COLOR_HEX}
                onSelect={onSelectNode}
                onSelectProjectMiniNode={onSelectProjectMiniNode}
                onSelectExperienceMiniNode={() => {}}
              />
              <OrbitalSatellites
                accentColor={ACCENT_COLOR_HEX}
                reducedMotion={Boolean(prefersReducedMotion)}
                isMobile={isMobile}
              />
            </group>
            <CameraRig
              latitude={selectedNode?.latitude ?? null}
              longitude={selectedNode?.longitude ?? null}
              homeLatitude={INITIAL_GLOBE_FOCUS.latitude}
              homeLongitude={INITIAL_GLOBE_FOCUS.longitude}
              mode={sceneMode}
              isMobile={isMobile}
              reducedMotion={Boolean(prefersReducedMotion)}
              applyDesktopViewOffset={isSplitView && selectedNode !== null}
              onFocusSettled={() => {
                setSceneMode("focused");
                setConnectorPathsActive(true);
              }}
              onReturnSettled={() => {
                setSelectedNode(null);
                setSceneMode("idle");
              }}
            />
            <ConnectorAnchorTracker
              latitude={connectorTargetLatLon.latitude}
              longitude={connectorTargetLatLon.longitude}
              onChange={setConnectorAnchorStore}
            />
            <CursorLatLonTracker onChange={setCursorLatLonStore} />
            {!prefersReducedMotion && <AdaptiveDpr pixelated />}
            <RuntimePerfMonitor />
          </Suspense>
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-slate-900/20 via-transparent to-slate-950/50" />

      <ProfileContactHub />
      <CursorReadout />

      {/* Section nav: in split-view, anchor over globe center so trays open centered below. */}
      <div
        className="pointer-events-none absolute top-4 z-[60] left-1/2 flex -translate-x-1/2 justify-center md:top-8"
        style={isSplitView ? { left: splitViewNavCenterX } : undefined}
      >
        <div className="relative flex max-w-full flex-col items-center gap-2 md:flex-row md:items-start">
          <nav
            className="pointer-events-auto flex max-w-full flex-wrap justify-center gap-2"
            aria-label="Resume sections"
          >
            {resumeNodes.map((node) => {
              const isActive = activeNodeId === node.id;
              const nodeGlowColor =
                node.id === "experience"
                  ? "rgba(56, 189, 248, 0.5)"
                  : node.id === "projects"
                    ? "rgba(167, 139, 250, 0.5)"
                    : colorToRgba(ACCENT_COLOR_HEX, 0.4);
              const buttonStyle = isActive
                ? {
                    borderColor: colorToRgba(ACCENT_COLOR_HEX, 0.88),
                    backgroundImage: `linear-gradient(135deg, ${colorToRgba(ACCENT_COLOR_HEX, 0.32)} 0%, ${colorToRgba(ACCENT_COLOR_HEX, 0.14)} 52%, rgba(15, 23, 42, 0.95) 100%)`,
                    color: "rgb(248, 250, 252)",
                    boxShadow: `0 0 0 1px ${colorToRgba(ACCENT_COLOR_HEX, 0.45)} inset, 0 0 28px ${colorToRgba(ACCENT_COLOR_HEX, 0.24)}, 0 10px 36px rgba(2, 6, 23, 0.55)`,
                  }
                : {
                    borderColor: "rgba(255, 255, 255, 0.24)",
                    backgroundImage: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.78) 100%)",
                    color: "rgb(226, 232, 240)",
                    boxShadow: "0 10px 24px rgba(2, 6, 23, 0.38)",
                  };
              return (
                <div key={node.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelectNode(node)}
                    className={`group relative isolate min-h-11 shrink-0 overflow-hidden px-4 py-2 text-sm font-semibold tracking-[0.01em] backdrop-blur-xl transition-all hover:-translate-y-[1px] hover:scale-[1.02] hover:border-sky-300/60 hover:text-white hover:shadow-[0_0_0_1px_rgba(125,211,252,0.34)_inset,0_16px_34px_rgba(2,6,23,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-0 active:translate-y-0 active:scale-[0.99] ${SURFACE_PILL_BUTTON}`}
                    style={{
                      ...buttonStyle,
                      transitionDuration: `${motionDuration.medium}s`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        backgroundImage: `radial-gradient(circle at 20% 20%, ${nodeGlowColor} 0%, rgba(15, 23, 42, 0) 58%)`,
                      }}
                    />
                    <span className="relative inline-flex items-center gap-2">{node.title}</span>
                  </button>
                </div>
              );
            })}
          </nav>
          {contextRibbon ? (
            <motion.div
              className="pointer-events-none mt-1 rounded-full border border-white/15 bg-slate-950/62 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200/95 backdrop-blur-xl md:mt-0 md:self-center"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: motionDuration.medium, ease: motionEase.smoothOut }}
            >
              {contextRibbon}
            </motion.div>
          ) : null}
        </div>
      </div>

      <ConnectorOverlay
        selectedNode={selectedNode}
        showConnectorLine={showConnectorLine}
        connectorPathsActive={connectorPathsActive}
        streamJunctionYPercent={streamJunctionYPercent}
        streamStartY={streamStartY}
        connectorBarWidthPct={connectorBarWidthPct}
        reducedMotion={Boolean(prefersReducedMotion)}
      />

      <ResumePanel
        node={showPanel}
        onClose={onClosePanel}
        onGoToNext={
          showPanel && panelNextNode ? () => onSelectNode(panelNextNode) : undefined
        }
        nextSectionTitle={panelNextNode?.title}
        isSplitView={isSplitView}
        streamStartY={streamStartY}
        splitViewPanelTop={splitPanelTop}
        splitViewPanelLeft={splitPanelLeft}
        splitViewPanelWidth={splitPanelWidth}
        splitViewPanelCenter={false}
        activeProjectMiniNodeId={activeProjectMiniNodeId}
        onSelectProjectMiniNode={onSelectProjectMiniNode}
        projectDetail={activeProjectDetail}
        onClearProjectSelection={onClearProjectSelection}
        onGoToPrevProject={() => onStepProject(-1)}
        onGoToNextProject={() => onStepProject(1)}
        projectNavPosition={projectNavPosition}
        projectBreadcrumb={projectBreadcrumb}
        contextRibbon={contextRibbon}
        onPanelAnchorChange={handleResumePanelAnchorChange}
      />
      <SceneLoader />
    </section>
  );
}
