"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace, Vector3 } from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Atmosphere } from "@/components/three/Atmosphere";
import { CameraRig } from "@/components/three/CameraRig";
import { Globe } from "@/components/three/Globe";
import { GlobeNodes } from "@/components/three/GlobeNodes";
import { GlobeWeather } from "@/components/three/GlobeWeather";
import { SpaceBackground, StarfieldBackdrop } from "@/components/three/SpaceBackground";
import { JUNCTION_X, ResumeConnector } from "@/components/ui/ResumeConnector";
import { ProfileContactHub } from "@/components/ui/ProfileContactHub";
import { ResumePanel } from "@/components/ui/ResumePanel";
import { SceneLoader } from "@/components/ui/SceneLoader";
import { INITIAL_GLOBE_FOCUS, resumeNodes, type ResumeNode } from "@/data/resumeNodes";
import { GLOBE_GROUP_Y_ROTATION, latLonToSceneWorld, sunDirectionInSceneWorld } from "@/lib/geo";

/** Subsolar: equator, Boston meridian (Americas / East Coast in daylight). */
const SUN_DIRECTION = sunDirectionInSceneWorld(0, -71.0589);

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
  const prevRef = useRef("");

  useFrame(() => {
    const worldPoint = worldPointRef.current;
    const ndcPoint = ndcPointRef.current;
    const camForward = camForwardRef.current;
    const toPoint = toPointRef.current;

    if (latitude === null || longitude === null) {
      onChange({ xPercent: 0, yPercent: 0, visible: false });
      return;
    }

    // Match uplink emitter core (GlobeNodes: surface 1.03 + ~0.0245 * scale along normal).
    worldPoint.copy(latLonToSceneWorld(latitude, longitude, 1.0623));
    ndcPoint.copy(worldPoint).project(camera);
    camera.getWorldDirection(camForward);

    toPoint.copy(worldPoint).sub(camera.position).normalize();
    const inFront = camForward.dot(toPoint) > 0;

    // Canvas is in a clipped/moved column; map NDC → canvas pixels → viewport %.
    const px = (ndcPoint.x * 0.5 + 0.5) * size.width;
    const py = (ndcPoint.y * -0.5 + 0.5) * size.height;
    const rect = gl.domElement.getBoundingClientRect();
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
    if (key !== prevRef.current) {
      prevRef.current = key;
      onChange(next);
    }
  });

  return null;
}

function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export function GlobeExperience() {
  const [selectedNode, setSelectedNode] = useState<ResumeNode | null>(null);
  const [sceneMode, setSceneMode] = useState<SceneMode>("idle");
  const sectionRef = useRef<HTMLElement | null>(null);
  const [sectionHeight, setSectionHeight] = useState(900);
  const [connectorAnchor, setConnectorAnchor] = useState<ConnectorAnchor>({
    xPercent: 23,
    yPercent: 64,
    visible: false,
  });
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useMobileLayout();

  const activeNodeId = selectedNode?.id ?? null;
  const showPanel =
    selectedNode !== null && (sceneMode === "focusing" || sceneMode === "focused")
      ? selectedNode
      : null;
  const panelNextNode =
    showPanel === null
      ? null
      : resumeNodes[
          (resumeNodes.findIndex((n) => n.id === showPanel.id) + 1) % resumeNodes.length
        ];
  /** Desktop: globe column is always narrow; panel slot is always on the right (no transition from full-width). */
  const isSplitView = !isMobile;
  const showConnectorLine = isSplitView && selectedNode !== null;
  /** Lower % = higher on screen. Kept high to leave most of the viewport for the resume panel. */
  const streamStartYPercent = selectedNode
    ? Math.max(12, Math.min(32, 26 - (selectedNode.latitude / 90) * 18))
    : 22;
  const streamStartY = `${streamStartYPercent}%`;
  const splitPanelTop = `calc(${streamStartYPercent}% + 1rem)`;
  const splitPanelLeft = `calc(${CONNECTOR_LINE_END_PCT}% + 0.5rem)`;
  const splitPanelWidth = `min(52rem, calc(100% - ${CONNECTOR_LINE_END_PCT}% - 1.25rem))`;
  // Horizontal beam is h-[2px] with top at streamStartY — center is 1px lower (same coords as SVG viewBox %).
  const streamJunctionYPercent = Math.min(
    100,
    streamStartYPercent + (1 / Math.max(1, sectionHeight)) * 100,
  );

  /** Briefly hide uplink when switching sections so the line does not crawl for ~1s; visible again during camera travel. */
  const [connectorPathsActive, setConnectorPathsActive] = useState(true);
  const prevSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = activeNodeId;
    if (id === null) {
      prevSelectedIdRef.current = null;
      setConnectorPathsActive(true);
      return;
    }
    const prev = prevSelectedIdRef.current;
    prevSelectedIdRef.current = id;
    if (prev !== null && prev !== id) {
      setConnectorPathsActive(false);
      const t = window.setTimeout(() => setConnectorPathsActive(true), 1000);
      return () => window.clearTimeout(t);
    }
  }, [activeNodeId]);

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

  const onSelectNode = (node: ResumeNode) => {
    setSelectedNode(node);
    setSceneMode("focusing");
  };

  const onClosePanel = () => {
    if (!selectedNode) return;
    setSceneMode("returning");
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
      {isSplitView ? (
        <div
          className="pointer-events-none absolute inset-0 z-0 hidden bg-black md:block"
          aria-hidden
        >
          <StarfieldBackdrop
            isMobile={isMobile}
            reducedMotion={Boolean(prefersReducedMotion)}
          />
        </div>
      ) : null}
      <motion.div
        className="absolute inset-0 z-0"
        initial={isMobile ? { width: "100%", x: "0%" } : { width: "58%", x: "-7%" }}
        animate={
          isMobile
            ? { width: "100%", x: "0%" }
            : { width: "58%", x: "-7%" }
        }
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <Canvas
          dpr={dprRange}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
            outputColorSpace: SRGBColorSpace,
          }}
          camera={{ position: [0, 0.2, 16.5], fov: 40 }}
        >
          <Suspense fallback={null}>
            <SpaceBackground
              isMobile={isMobile}
              sunDirection={SUN_DIRECTION}
              includeStars={!isSplitView}
              transparentBackground={isSplitView}
            />
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
                reducedMotion={Boolean(prefersReducedMotion)}
                onSelect={onSelectNode}
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
              onFocusSettled={() => setSceneMode("focused")}
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
            {!prefersReducedMotion && <AdaptiveDpr pixelated />}
          </Suspense>
        </Canvas>
      </motion.div>

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-slate-900/20 via-transparent to-slate-950/50" />

      <ProfileContactHub />

      {/* Section nav: centered in space to the right of the top-left profile card. */}
      <div className="pointer-events-none absolute left-0 right-0 top-4 z-[48] flex justify-center pl-[min(19.5rem,calc(100vw-9.5rem))] pr-2 md:top-8 md:pl-[min(22rem,32vw)] md:pr-8">
        <nav
          className="pointer-events-auto flex max-w-full flex-wrap justify-center gap-2"
          aria-label="Resume sections"
        >
          {resumeNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectNode(node)}
              className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-md transition ${
                activeNodeId === node.id
                  ? "border-cyan-300/80 bg-cyan-500/20 text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                  : "border-white/20 bg-slate-900/55 text-slate-100 hover:border-cyan-200/70 hover:bg-slate-800/70"
              }`}
            >
              {node.title}
            </button>
          ))}
        </nav>
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
                  pathsActive={connectorPathsActive}
                />
              )}
            </AnimatePresence>
            <motion.div
              key={selectedNode.id}
              className="absolute h-[2px] rounded-full bg-cyan-300/85"
              style={{
                top: streamStartY,
                left: `${CONNECTOR_BAR_LEFT_PCT}%`,
                width: `${CONNECTOR_BAR_WIDTH_PCT}%`,
                transformOrigin: "left center",
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{
                scaleX: connectorPathsActive ? 1 : 0,
                opacity: connectorPathsActive ? 1 : 0,
              }}
              exit={{ scaleX: 0, opacity: 0 }}
              transition={{
                duration: connectorPathsActive ? 0.38 : 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
      />
      <SceneLoader />
    </section>
  );
}
