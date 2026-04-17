"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import {
  CONNECTOR_CONNECT_SEC,
  CONNECTOR_RETRACT_SEC,
  JUNCTION_X,
  ResumeConnector,
} from "@/components/ui/ResumeConnector";
import { ProfileContactHub } from "@/components/ui/ProfileContactHub";
import { ResumePanel } from "@/components/ui/ResumePanel";
import { SceneLoader } from "@/components/ui/SceneLoader";
import { experienceMiniNodes } from "@/data/experienceMiniNodes";
import { projectMiniNodes } from "@/data/projectMiniNodes";
import { INITIAL_GLOBE_FOCUS, resumeNodes, type ResumeNode } from "@/data/resumeNodes";
import { ACCENT_COLOR_HEX, colorToRgba } from "@/lib/colorFormat";
import { useCanvasScreenRect } from "@/lib/useCanvasScreenRect";
import {
  GLOBE_GROUP_Y_ROTATION,
  LONGITUDE_ALIGNMENT_OFFSET_DEG,
  latLonToSceneWorld,
  sunDirectionForSunsetAt,
} from "@/lib/geo";

/** Terminator through 60°N; sun on horizon there. Longitude sets where that great circle crosses the map. */
const SUN_TERMINATOR_AT: { lat: number; lon: number } = { lat: -60, lon: -90 };

const SUN_DIRECTION = sunDirectionForSunsetAt(
  SUN_TERMINATOR_AT.lat,
  SUN_TERMINATOR_AT.lon,
  INITIAL_GLOBE_FOCUS,
);

/** Horizontal beam + SVG junction. Panel anchors after line end. */
const CONNECTOR_BAR_LEFT_PCT = JUNCTION_X;
/** Short stub from junction — panel starts just after this for maximum text width. */
const CONNECTOR_BAR_WIDTH_PCT = 13;
const CONNECTOR_LINE_END_PCT = CONNECTOR_BAR_LEFT_PCT + CONNECTOR_BAR_WIDTH_PCT;
type SceneMode = "idle" | "focusing" | "focused" | "returning";

type ConnectorAnchor = {
  xPercent: number;
  yPercent: number;
  visible: boolean;
};

type CursorLatLon = {
  latitude: number | null;
  longitude: number | null;
};

type MiniDetailInfo = {
  title: string;
  groupLabel: string;
  summary: string;
  details: string;
};

const CONNECTOR_ANCHOR_HIDDEN_KEY = "__hidden__";

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

function miniBulletParts(bullet: string): { summary: string; details: string } {
  const clean = bullet.replace(/\*\*/g, "");
  const colon = clean.indexOf(": ");
  if (colon > 0 && colon < clean.length - 2) {
    return {
      summary: clean.slice(0, colon),
      details: clean.slice(colon + 2),
    };
  }
  return { summary: clean, details: clean };
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
        className="pointer-events-auto absolute left-1/2 top-[max(5.5rem,8dvh)] z-50 w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-white/20 bg-white/10 p-6 text-slate-100 shadow-2xl backdrop-blur-xl md:left-auto md:right-[2.75rem] md:top-[max(7rem,11dvh)] md:w-[34rem] md:translate-x-0 md:p-8"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg leading-none text-slate-100 transition hover:bg-white/20"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-lg font-semibold leading-snug text-white">{detail.summary}</p>
          <p className="text-base leading-7 text-slate-200 md:text-[1.05rem] md:leading-8">
            {detail.details}
          </p>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

export function GlobeExperience() {
  const [selectedNode, setSelectedNode] = useState<ResumeNode | null>(null);
  const [activeProjectMiniNodeId, setActiveProjectMiniNodeId] = useState<string | null>(null);
  const [activeExperienceMiniNodeId, setActiveExperienceMiniNodeId] = useState<string | null>(null);
  const [pendingExperienceScrollIndex, setPendingExperienceScrollIndex] = useState<number | null>(null);
  const [sceneMode, setSceneMode] = useState<SceneMode>("idle");
  const sectionRef = useRef<HTMLElement | null>(null);
  const [sectionHeight, setSectionHeight] = useState(900);
  const [connectorAnchor, setConnectorAnchor] = useState<ConnectorAnchor>({
    xPercent: 23,
    yPercent: 64,
    visible: false,
  });
  const [cursorLatLon, setCursorLatLon] = useState<CursorLatLon>({
    latitude: null,
    longitude: null,
  });
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useMobileLayout();

  const activeNodeId = selectedNode?.id ?? null;
  const isProjectsSelected = selectedNode?.id === "projects";
  const isExperienceSelected = selectedNode?.id === "experience";
  const projectsNode = useMemo(() => resumeNodes.find((node) => node.id === "projects") ?? null, []);
  const experienceNode = useMemo(() => resumeNodes.find((node) => node.id === "experience") ?? null, []);
  const activeProjectMiniNode =
    activeProjectMiniNodeId !== null
      ? projectMiniNodes.find((mini) => mini.id === activeProjectMiniNodeId) ?? null
      : null;
  const activeExperienceMiniNode =
    activeExperienceMiniNodeId !== null
      ? experienceMiniNodes.find((mini) => mini.id === activeExperienceMiniNodeId) ?? null
      : null;
  const activeMiniDetail: MiniDetailInfo | null = useMemo(() => {
    if (isProjectsSelected && activeProjectMiniNode && projectsNode?.projectSubsections) {
      const bullet =
        projectsNode.projectSubsections[activeProjectMiniNode.subsection][
          activeProjectMiniNode.subsectionIndex
        ] ?? "";
      const { summary, details } = miniBulletParts(bullet);
      return {
        title: activeProjectMiniNode.title,
        groupLabel: "Project detail",
        summary,
        details,
      };
    }
    if (isExperienceSelected && activeExperienceMiniNode && experienceNode) {
      const bullet = experienceNode.bullets[activeExperienceMiniNode.bulletIndex] ?? "";
      const { summary, details } = miniBulletParts(bullet);
      return {
        title: activeExperienceMiniNode.title,
        groupLabel: "Experience detail",
        summary,
        details,
      };
    }
    return null;
  }, [
    activeExperienceMiniNode,
    activeProjectMiniNode,
    experienceNode,
    isExperienceSelected,
    isProjectsSelected,
    projectsNode,
  ]);
  const showPanel =
    selectedNode !== null && (sceneMode === "focusing" || sceneMode === "focused")
      ? selectedNode
      : null;
  const showMainResumePanel = !(
    activeMiniDetail !== null && (isProjectsSelected || isExperienceSelected)
  );
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
  const showConnectorLine =
    isSplitView &&
    selectedNode !== null &&
    sceneMode === "focused" &&
    connectorPathsActive;
  /** Lower % = higher on screen. Same pin-based beam + same panel lift offset for every resume tab vs the beam. */
  const streamStartYPercent = selectedNode
    ? Math.max(12, Math.min(32, 26 - (selectedNode.latitude / 90) * 18))
    : 22;
  const streamStartY = `${streamStartYPercent}%`;
  const RESUME_PANEL_LIFT_PCT = 4;
  const resumePanelTopPercent = Math.max(10, streamStartYPercent - RESUME_PANEL_LIFT_PCT);
  const splitPanelBaseTop = `calc(${resumePanelTopPercent}% + 1rem)`;
  const useTopTabStackLayout = isSplitView && (isProjectsSelected || isExperienceSelected);
  // Keep the split-view panel from colliding with open mini-node trays near the top nav.
  const splitPanelTop = isProjectsSelected
    ? `max(${splitPanelBaseTop}, 20.5rem)`
    : isExperienceSelected
      ? `max(${splitPanelBaseTop}, 19rem)`
      : splitPanelBaseTop;
  const splitPanelLeft = useTopTabStackLayout
    ? "50%"
    : `calc(${CONNECTOR_LINE_END_PCT}% + 0.5rem)`;
  const splitPanelWidth = useTopTabStackLayout
    ? "min(58rem, calc(100% - 2rem))"
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
        if (node.id !== "experience") setActiveExperienceMiniNodeId(null);
        setPendingExperienceScrollIndex(null);
        setSceneMode("focusing");
      });
      return;
    }

    // Initial selection.
    setConnectorPathsActive(false);
    setSelectedNode(node);
    if (node.id !== "projects") setActiveProjectMiniNodeId(null);
    if (node.id !== "experience") setActiveExperienceMiniNodeId(null);
    setPendingExperienceScrollIndex(null);
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
    setPendingExperienceScrollIndex(null);
    setActiveProjectMiniNodeId(miniNodeId);
  };

  const onSelectExperienceMiniNode = (miniNodeId: string) => {
    if (selectedNode?.id !== "experience") {
      const experienceNode = resumeNodes.find((node) => node.id === "experience");
      if (!experienceNode) return;
      setConnectorPathsActive(false);
      setSelectedNode(experienceNode);
      setSceneMode("focusing");
    } else {
      setSceneMode("focusing");
    }
    setPendingExperienceScrollIndex(null);
    setActiveExperienceMiniNodeId(miniNodeId);
  };

  const onClosePanel = () => {
    setConnectorPathsActive(false);
    setActiveProjectMiniNodeId(null);
    setActiveExperienceMiniNodeId(null);
    setPendingExperienceScrollIndex(null);
    setSelectedNode(null);
    // Keep the current camera pose; only close UI overlays.
    setSceneMode("idle");
  };

  const dprRange: [number, number] = prefersReducedMotion
    ? [1, 1.2]
    : isMobile
      ? [1, 1.2]
      : [1, 1.5];

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
            <SpaceBackground sunDirection={SUN_DIRECTION} isMobile={isMobile} />
            <group rotation={[0, GLOBE_GROUP_Y_ROTATION, 0]}>
              <Globe
                isMobile={isMobile}
                reducedMotion={Boolean(prefersReducedMotion)}
                sunDirection={SUN_DIRECTION}
              />
              <GlobeWeather
                isMobile={isMobile}
                reducedMotion={Boolean(prefersReducedMotion)}
                sunDirection={SUN_DIRECTION}
              />
              <Atmosphere sunDirection={SUN_DIRECTION} />
              <GlobeNodes
                activeNodeId={activeNodeId}
                activeProjectMiniNodeId={activeProjectMiniNodeId}
                activeExperienceMiniNodeId={activeExperienceMiniNodeId}
                showProjectMiniNodes
                showExperienceMiniNodes
                reducedMotion={Boolean(prefersReducedMotion)}
                accentColor={ACCENT_COLOR_HEX}
                onSelect={onSelectNode}
                onSelectProjectMiniNode={onSelectProjectMiniNode}
                onSelectExperienceMiniNode={onSelectExperienceMiniNode}
              />
              <OrbitalSatellites
                accentColor={ACCENT_COLOR_HEX}
                reducedMotion={Boolean(prefersReducedMotion)}
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
              latitude={selectedNode?.latitude ?? null}
              longitude={selectedNode?.longitude ?? null}
              onChange={setConnectorAnchor}
            />
            <CursorLatLonTracker onChange={setCursorLatLon} />
            {!prefersReducedMotion && <AdaptiveDpr pixelated />}
          </Suspense>
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-slate-900/20 via-transparent to-slate-950/50" />

      <ProfileContactHub />
      <div className="pointer-events-auto absolute bottom-4 left-4 z-[52] flex max-w-[calc(100vw-2rem)] flex-col gap-3 md:bottom-8 md:left-8 md:max-w-[calc(100vw-4rem)]">
        <div className="w-[13.5rem] shrink-0 rounded-lg border border-white/20 bg-slate-950/80 px-3 py-2 text-xs backdrop-blur-md md:text-sm">
          {cursorLatLon.latitude !== null && cursorLatLon.longitude !== null ? (
            <span style={{ color: ACCENT_COLOR_HEX }}>
              Lat {cursorLatLon.latitude.toFixed(2)}°, Lon {cursorLatLon.longitude.toFixed(2)}°
            </span>
          ) : (
            <span className="font-medium text-red-400">N/A</span>
          )}
        </div>
      </div>

      {/* Section nav: centered in space to the right of the top-left profile card. */}
      <div className="pointer-events-none absolute left-0 right-0 top-4 z-[60] flex justify-center pl-[min(19.5rem,calc(100vw-9.5rem))] pr-2 md:top-8 md:pl-[min(22rem,32vw)] md:pr-8">
        <div className="relative flex max-w-full flex-col items-center gap-2 md:flex-row md:items-start">
          <nav
            className="pointer-events-auto flex max-w-full flex-wrap justify-center gap-2"
            aria-label="Resume sections"
          >
            {resumeNodes.map((node) => {
              const isActive = activeNodeId === node.id;
              return (
                <div key={node.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onSelectNode(node)}
                    className="min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-md transition"
                    style={
                      isActive
                        ? {
                            borderColor: colorToRgba(ACCENT_COLOR_HEX, 0.78),
                            backgroundColor: colorToRgba(ACCENT_COLOR_HEX, 0.18),
                            color: "rgb(248, 250, 252)",
                            boxShadow: `0 0 20px ${colorToRgba(ACCENT_COLOR_HEX, 0.16)}`,
                          }
                        : {
                            borderColor: "rgba(255, 255, 255, 0.2)",
                            backgroundColor: "rgba(15, 23, 42, 0.55)",
                            color: "rgb(241, 245, 249)",
                          }
                    }
                    onMouseEnter={(e) => {
                      if (activeNodeId === node.id) return;
                      e.currentTarget.style.borderColor = colorToRgba(ACCENT_COLOR_HEX, 0.5);
                      e.currentTarget.style.backgroundColor = "rgba(30, 41, 59, 0.7)";
                    }}
                    onMouseLeave={(e) => {
                      if (activeNodeId === node.id) return;
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                      e.currentTarget.style.backgroundColor = "rgba(15, 23, 42, 0.55)";
                    }}
                  >
                    {node.title}
                  </button>
                  {node.id === "experience" ? (
                    <AnimatePresence>
                      {isExperienceSelected ? (
                        <motion.div
                          className="pointer-events-auto absolute right-0 top-full mt-3 w-[min(96vw,36rem)] overflow-y-auto rounded-3xl border border-white/20 bg-slate-950/78 p-3.5 shadow-[0_20px_60px_rgba(2,6,23,0.55)] backdrop-blur-xl md:w-[34rem]"
                          initial={{ opacity: 0, y: -8, x: 10 }}
                          animate={{ opacity: 1, y: 0, x: 0 }}
                          exit={{ opacity: 0, y: -6, x: 8 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                          <div className="mb-3 flex items-center justify-between px-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">
                              Experience nodes
                            </div>
                            <div className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-300">
                              {experienceMiniNodes.length} total
                            </div>
                          </div>
                          <div className="grid w-full grid-cols-2 gap-2.5 md:grid-cols-4">
                            {experienceMiniNodes.map((miniNode) => {
                              const isMiniActive = activeExperienceMiniNodeId === miniNode.id;
                              return (
                                <button
                                  key={miniNode.id}
                                  type="button"
                                  onClick={() => onSelectExperienceMiniNode(miniNode.id)}
                                  className="rounded-xl border px-3 py-2.5 text-left text-xs font-medium leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 md:text-[0.8rem]"
                                  style={
                                    isMiniActive
                                      ? {
                                          borderColor: colorToRgba(ACCENT_COLOR_HEX, 0.88),
                                          backgroundColor: colorToRgba(ACCENT_COLOR_HEX, 0.22),
                                          color: "rgb(240, 249, 255)",
                                          boxShadow: `0 0 0 1px ${colorToRgba(ACCENT_COLOR_HEX, 0.35)} inset, 0 10px 28px ${colorToRgba(ACCENT_COLOR_HEX, 0.18)}`,
                                        }
                                      : {
                                          borderColor: "rgba(148, 163, 184, 0.32)",
                                          backgroundColor: "rgba(15, 23, 42, 0.72)",
                                          color: "rgb(226, 232, 240)",
                                        }
                                  }
                                >
                                  {miniNode.title}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <AnimatePresence>
            {isProjectsSelected ? (
              <motion.div
                className="pointer-events-auto max-h-[min(70dvh,30rem)] w-[min(96vw,46rem)] overflow-y-auto rounded-3xl border border-white/20 bg-slate-950/78 p-3.5 shadow-[0_20px_60px_rgba(2,6,23,0.55)] backdrop-blur-xl md:absolute md:left-full md:top-0 md:ml-3 md:max-h-[calc(100dvh-7rem)] md:w-[42rem]"
                initial={{ opacity: 0, y: -8, x: -10 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, y: -6, x: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200">
                    Project nodes
                  </div>
                  <div className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-300">
                    {projectMiniNodes.length} total
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  {projectMiniNodes.map((miniNode) => {
                    const isActive = activeProjectMiniNodeId === miniNode.id;
                    return (
                      <button
                        key={miniNode.id}
                        type="button"
                        onClick={() => onSelectProjectMiniNode(miniNode.id)}
                        className="rounded-xl border px-3 py-2.5 text-left text-xs font-medium leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 md:text-[0.8rem]"
                        style={
                          isActive
                            ? {
                                borderColor: colorToRgba(ACCENT_COLOR_HEX, 0.88),
                                backgroundColor: colorToRgba(ACCENT_COLOR_HEX, 0.22),
                                color: "rgb(240, 249, 255)",
                                boxShadow: `0 0 0 1px ${colorToRgba(ACCENT_COLOR_HEX, 0.35)} inset, 0 10px 28px ${colorToRgba(ACCENT_COLOR_HEX, 0.18)}`,
                              }
                            : {
                                borderColor: "rgba(148, 163, 184, 0.32)",
                                backgroundColor: "rgba(15, 23, 42, 0.72)",
                                color: "rgb(226, 232, 240)",
                              }
                        }
                      >
                        {miniNode.title}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {selectedNode && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 hidden md:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <AnimatePresence>
              {showConnectorLine && connectorAnchor.visible && (
                <ResumeConnector
                  key="resume-connector"
                  pinX={connectorAnchor.xPercent}
                  pinY={connectorAnchor.yPercent}
                  yJunction={streamJunctionYPercent}
                  reducedMotion={Boolean(prefersReducedMotion)}
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
                width: `${CONNECTOR_BAR_WIDTH_PCT}%`,
                transformOrigin: "left center",
                backgroundColor: ACCENT_COLOR_HEX,
                boxShadow: `0 0 6px ${colorToRgba(ACCENT_COLOR_HEX, 0.5)}, 0 0 14px ${colorToRgba(ACCENT_COLOR_HEX, 0.25)}`,
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{
                scaleX: showConnectorLine ? 1 : 0,
                opacity: showConnectorLine ? 1 : 0,
              }}
              exit={{ scaleX: 0, opacity: 0 }}
              transition={{
                duration: connectorPathsActive ? CONNECTOR_CONNECT_SEC : CONNECTOR_RETRACT_SEC,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ResumePanel
        node={showMainResumePanel ? showPanel : null}
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
        splitViewPanelCenter={useTopTabStackLayout}
        activeProjectMiniNodeId={activeProjectMiniNodeId}
        onSelectProjectMiniNode={onSelectProjectMiniNode}
        scrollToBulletIndex={pendingExperienceScrollIndex}
        onDidScrollToBullet={() => setPendingExperienceScrollIndex(null)}
      />
      {activeMiniDetail ? <MiniNodeDetailPanel detail={activeMiniDetail} onClose={onClosePanel} /> : null}
      <SceneLoader />
    </section>
  );
}
