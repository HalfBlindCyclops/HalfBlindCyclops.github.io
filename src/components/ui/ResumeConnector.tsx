"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ACCENT_COLOR_HEX } from "@/lib/colorFormat";

/** Horizontal beam junction in SVG viewBox units (matches GlobeExperience `CONNECTOR_BAR_LEFT_PCT`). */
export const JUNCTION_X = 45;

type AxisSample = { s: number; x: number; y: number; nx: number; ny: number };

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

type PathPoint = { x: number; y: number };

/** Dense baseline samples along pin → junction (smooth cubic fit). */
function sampleConnectorAxisDense(px: number, py: number, yJ: number, xJ: number): AxisSample[] {
  const ax = px;
  const ay = py;
  const bx = xJ;
  const by = yJ;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const totalLen = len;
  const out: AxisSample[] = [];
  const steps = Math.max(72, Math.ceil(len * 14));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const arc = len * t;
    const s = arc / totalLen;
    const x = ax + dx * t;
    const y = ay + dy * t;
    out.push({ s, x, y, nx, ny });
  }
  return out;
}

/** Catmull–Rom → cubic Bézier: C¹-continuous path, no polyline corners. */
function smoothPathThroughPoints(pts: PathPoint[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (n === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < n ? pts[i + 2] : pts[i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Gaussian width in path parameter s (0–1); peak follows packetCenter. */
const PACKET_GAUSS_SIGMA = 0.044;
/** Carrier cycles per σ in r = (s − center)/σ — cosine at r=0 aligns with envelope peak (symmetric burst). */
const PACKET_CARRIER_PER_SIGMA = 1.22;
const PACKET_BURST_PEAK = 0.64;
const PACKET_BASELINE_RIPPLE_AMP = 0.036;
const PACKET_BASELINE_RIPPLE_FREQ = 2.65;

function packetBaselineRipple(s: number, phase: number): number {
  return (
    PACKET_BASELINE_RIPPLE_AMP *
    Math.sin(2 * Math.PI * PACKET_BASELINE_RIPPLE_FREQ * s + phase * 1.61 + 0.35)
  );
}

/** Smooth multipath RF: detuned rays interfere along the link; timePhase drifts for slow fading. */
const RF_BASE_CYCLES = 5.35;
const RF_TIME_DRIFT_RAD_PER_SEC = 2.15;
const RF_PEAK = 0.54;
/** Straight chord: burst strength. RF layer: smooth baseline ripple mix. */
const RF_PACKET_BURST_GAIN = 0.82;
const RF_PACKET_RIPPLE_MIX = 0.58;
/** Extra gain on multipath so the bottom layer reads over the chord. */
const RF_LAYER_MULTIPATH_GAIN = 1.22;
const RF_CHAOS_GAIN = 1.45;

const RF_LINK_STROKE_WIDTH = 2.35;

const PACKET_TRAVEL_SEC = 1.25;

/** Deterministic 0–1 “random” for burst identity / shaping. */
function rfHash01(k: number): number {
  const x = Math.sin(k * 127.1 + k * k * 0.0001 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function rfMultipathNormalOffset(s: number, timePhase: number, spatialPhase: number): number {
  const τ = 2 * Math.PI;
  const linkWin = 0.56 + 0.44 * Math.pow(Math.sin(Math.PI * clamp01(s)), 1.06);
  const t = timePhase;
  const sp = spatialPhase;
  const wobble =
    1 +
    0.18 * Math.sin(t * 0.52 + sp * 1.4 + s * 6.2) +
    0.11 * Math.sin(t * 0.89 - s * 4.7);
  const θ = τ * RF_BASE_CYCLES * s + spatialPhase + timePhase * 0.55;
  const mix =
    Math.sin(θ) * wobble +
    0.42 * Math.sin(θ * 1.036 + t * 1.14 + sp * 0.38 + Math.sin(t * 0.31) * 0.4) +
    0.3 * Math.sin(θ * 0.971 + t * -0.97 + sp * 0.55 + 1.05) +
    0.19 * Math.sin(θ * 1.058 + t * 0.51 + sp * 0.22 + 1.82) +
    0.12 * Math.sin(θ * 1.089 + t * -0.41 + sp * 0.71);
  const norm = 1 / 2.03;
  const carrier = RF_PEAK * linkWin * mix * norm;
  const fine =
    0.024 * Math.sin(τ * 18.2 * s + t * 2.55 + sp) +
    0.014 * Math.sin(τ * 26.5 * s - t * 1.62 + sp * 1.18) +
    0.018 * Math.sin(τ * (14.7 * s + 3.9 * Math.sin(t * 0.27)) + sp);
  return carrier + fine;
}

/** Wideband clutter + beats — smooth but erratic “spectrum” feel. */
function rfChaosOffset(s: number, timePhase: number, spatialPhase: number): number {
  const τ = 2 * Math.PI;
  const t = timePhase;
  const sp = spatialPhase;
  const iq =
    1 +
    0.26 * Math.sin(t * 0.44 + sp * 1.35) +
    0.16 * Math.sin(t * 0.71 - sp * 0.92 + s * 3.1);
  let rug = 0;
  rug += 0.048 * Math.sin(τ * (27.3 * s + 4.2 * t) + t * 2.05 + sp);
  rug += 0.041 * Math.sin(τ * (41.7 * s - 3.5 * t + sp * 1.7));
  rug += 0.035 * Math.sin(τ * (19.1 * s + 7.4 * t + sp * 2.05));
  rug += 0.032 * Math.sin(τ * (53.2 * s + 1.65 * t));
  rug += 0.04 * Math.sin(τ * 11.9 * s + t * 5.6) * Math.sin(τ * 2.35 * s + t * 1.8);
  rug += 0.028 * Math.sin(τ * (33.8 * s - 2.2 * t + sp * 2.4));
  const flutter =
    0.022 * Math.sin(τ * (63 * s + 11.2 * t + sp)) +
    0.017 * Math.sin(τ * (71 * s - 8.1 * t + sp * 3.2)) +
    0.014 * Math.sin(τ * (88 * s + 6.3 * t));
  return RF_CHAOS_GAIN * iq * (rug + flutter);
}

/** Bottom layer: multipath + chaos + ripple along the whole link. */
function rfLayerNormalOffset(
  s: number,
  phase: number,
  timePhase: number,
  spatialPhase: number,
): number {
  return (
    RF_LAYER_MULTIPATH_GAIN * rfMultipathNormalOffset(s, timePhase, spatialPhase) +
    rfChaosOffset(s, timePhase, spatialPhase) +
    RF_PACKET_RIPPLE_MIX * packetBaselineRipple(s, phase)
  );
}

function buildRfLayerPathD(
  px: number,
  py: number,
  yJ: number,
  xJ: number,
  timePhase: number,
  spatialPhase: number,
  phase: number,
): string {
  const samples = sampleConnectorAxisDense(px, py, yJ, xJ);
  const pts: PathPoint[] = [];
  for (const p of samples) {
    const off = rfLayerNormalOffset(p.s, phase, timePhase, spatialPhase);
    pts.push({ x: p.x + p.nx * off, y: p.y + p.ny * off });
  }
  return smoothPathThroughPoints(pts);
}

type RfBurstShape = {
  centerJitter: number;
  sigmaScale: number;
  gain: number;
  carrierMul: number;
  phaseOff: number;
  h2w: number;
  envPow: number;
};

function rfBurstShape(burstKey: number, pinPhase: number): RfBurstShape {
  const h = (n: number) => rfHash01(burstKey * 2654435761 + n * 1597334677);
  return {
    centerJitter: (h(1) - 0.5) * 0.05,
    sigmaScale: 0.82 + h(2) * 0.34,
    gain: RF_PACKET_BURST_GAIN * (0.62 + h(3) * 0.38),
    carrierMul: 0.82 + h(4) * 0.44,
    phaseOff: (h(5) - 0.5) * 5.5 + pinPhase * 0.15 + h(6) * Math.PI,
    h2w: h(7) * 0.38,
    envPow: 0.82 + h(8) * 0.38,
  };
}

/** Pulse normal offset on chord; tails decay to ~0 for straight pin→junction runs. */
function straightBurstNormalOffset(
  s: number,
  packetCenter: number,
  phase: number,
  shape: RfBurstShape,
): number {
  const c = clamp01(packetCenter + shape.centerJitter);
  const sigma = PACKET_GAUSS_SIGMA * shape.sigmaScale;
  const r = (s - c) / sigma;
  const envelope = Math.pow(Math.exp(-r * r), shape.envPow);
  const u = 2 * Math.PI * PACKET_CARRIER_PER_SIGMA * shape.carrierMul * r + phase + shape.phaseOff;
  const carrier = Math.cos(u) + shape.h2w * Math.cos(2 * u + 1.18);
  const norm = 1 / (1 + Math.abs(shape.h2w));
  return shape.gain * PACKET_BURST_PEAK * envelope * carrier * norm;
}

/** Full chord: straight segments before/after pulse, burst only where envelope is significant. */
function buildStraightChordWithBurstPathD(
  px: number,
  py: number,
  yJ: number,
  xJ: number,
  packetCenter: number,
  phase: number,
  burstKey: number,
): string {
  const shape = rfBurstShape(burstKey, phase);
  const samples = sampleConnectorAxisDense(px, py, yJ, xJ);
  const pts: PathPoint[] = [];
  for (const p of samples) {
    const off = straightBurstNormalOffset(p.s, packetCenter, phase, shape);
    pts.push({ x: p.x + p.nx * off, y: p.y + p.ny * off });
  }
  return smoothPathThroughPoints(pts);
}

/** Multipath layer + modulated chord burst along pin → junction. */
function RfLinkPaths({
  pinX,
  pinY,
  yJunction,
  reducedMotion,
  pathsActive,
  lineColor = ACCENT_COLOR_HEX,
}: {
  pinX: number;
  pinY: number;
  yJunction: number;
  reducedMotion: boolean;
    /** When false, paths are cleared and the RF loop is paused. */
  pathsActive: boolean;
  lineColor?: string;
}) {
  const rfLayerRef = useRef<SVGPathElement | null>(null);
  const chordRef = useRef<SVGPathElement | null>(null);
  const propsRef = useRef({ pinX, pinY, yJ: yJunction });
  useLayoutEffect(() => {
    propsRef.current = { pinX, pinY, yJ: yJunction };
  }, [pinX, pinY, yJunction]);

  useEffect(() => {
    if (!pathsActive) {
      rfLayerRef.current?.setAttribute("d", "");
      chordRef.current?.setAttribute("d", "");
      return;
    }

    const apply = (packetCenter: number, timePhase: number, burstKey: number) => {
      const { pinX: px, pinY: py, yJ } = propsRef.current;
      const phase = px * 0.083 + py * 0.057;
      const spatialPhase = px * 0.092 + py * 0.068;
      const rfD = buildRfLayerPathD(px, py, yJ, JUNCTION_X, timePhase, spatialPhase, phase);
      const chordD = buildStraightChordWithBurstPathD(
        px,
        py,
        yJ,
        JUNCTION_X,
        packetCenter,
        phase,
        burstKey,
      );
      rfLayerRef.current?.setAttribute("d", rfD);
      chordRef.current?.setAttribute("d", chordD);
    };

    if (reducedMotion) {
      const { pinX: px, pinY: py } = propsRef.current;
      const burstKey = Math.floor(px * 73 + py * 91) | 0;
      apply(0.44, 1.15, burstKey);
      return;
    }

    const t0 = performance.now();
    let rafId = 0;
    const loop = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const u = elapsed % PACKET_TRAVEL_SEC;
      const packetCenter = 0.065 + (u / PACKET_TRAVEL_SEC) * 0.87;
      const timePhase = elapsed * RF_TIME_DRIFT_RAD_PER_SEC;
      const { pinX: px, pinY: py } = propsRef.current;
      const burstKey =
        (Math.floor(elapsed / PACKET_TRAVEL_SEC) * 1009 + Math.floor(px * 73 + py * 91)) | 0;
      apply(packetCenter, timePhase, burstKey);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [pathsActive, pinX, pinY, yJunction, reducedMotion]);

  const pathRender = {
    shapeRendering: "geometricPrecision" as const,
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const commonLine = {
    fill: "none" as const,
    stroke: lineColor,
    strokeOpacity: 1,
    strokeWidth: RF_LINK_STROKE_WIDTH,
    ...pathRender,
  };

  return (
    <>
      <path ref={rfLayerRef} {...commonLine} />
      <path ref={chordRef} {...commonLine} />
    </>
  );
}

const svgClass =
  "pointer-events-none absolute inset-0 h-full w-full overflow-visible";

const svgPresenceTransition = { duration: 0.35, ease: "easeOut" as const };

type ResumeConnectorProps = {
  pinX: number;
  pinY: number;
  yJunction: number;
  reducedMotion: boolean;
  /** When false, paths are hidden and the RF loop pauses (e.g. brief gap when switching pins). */
  pathsActive: boolean;
  lineColor?: string;
};

export function ResumeConnector({
  pinX,
  pinY,
  yJunction,
  reducedMotion,
  pathsActive,
  lineColor = ACCENT_COLOR_HEX,
}: ResumeConnectorProps) {
  return (
    <motion.svg
      className={svgClass}
      style={{ color: lineColor }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      initial={{ opacity: 0 }}
      animate={{ opacity: pathsActive ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={pathsActive ? svgPresenceTransition : { duration: 0.08 }}
    >
      <RfLinkPaths
        pinX={pinX}
        pinY={pinY}
        yJunction={yJunction}
        reducedMotion={reducedMotion}
        pathsActive={pathsActive}
        lineColor="currentColor"
      />
    </motion.svg>
  );
}
