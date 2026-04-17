"use client";

import { useMemo, useRef, type MutableRefObject } from "react";
import { Color, Mesh, Vector3 } from "three";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { resumeNodes } from "@/data/resumeNodes";
import { latLonToVector3 } from "@/lib/geo";

type OrbitalSatellitesProps = {
  accentColor: string;
  reducedMotion: boolean;
  isMobile: boolean;
};

type SatelliteSpec = {
  id: string;
  radius: number;
  speed: number;
  phase: number;
  inclinationDeg: number;
  yawDeg: number;
  eccentricity?: number;
  argumentOfPerigeeDeg?: number;
};

type SatellitePair = {
  id: string;
  aIndex: number;
  bIndex: number;
  phase: number;
};

const SATELLITE_SPECS: SatelliteSpec[] = [
  {
    id: "sat-about",
    radius: 1.62,
    speed: 0.03,
    phase: 0.9,
    inclinationDeg: 33,
    yawDeg: -96,
    eccentricity: 0.12,
    argumentOfPerigeeDeg: 24,
  },
  {
    id: "sat-experience",
    radius: 2.22,
    speed: 0.012,
    phase: 2.55,
    inclinationDeg: 58,
    yawDeg: -112,
    eccentricity: 0.34,
    argumentOfPerigeeDeg: 250,
  },
  {
    id: "sat-projects",
    radius: 1.88,
    speed: 0.018,
    phase: 4.6,
    inclinationDeg: 42,
    yawDeg: -84,
    eccentricity: 0.08,
    argumentOfPerigeeDeg: 196,
  },
  {
    id: "sat-relay-1",
    radius: 1.74,
    speed: 0.024,
    phase: 1.7,
    inclinationDeg: 49,
    yawDeg: -101,
    eccentricity: 0.09,
    argumentOfPerigeeDeg: 302,
  },
  {
    id: "sat-relay-2",
    radius: 2.06,
    speed: 0.016,
    phase: 3.3,
    inclinationDeg: 55,
    yawDeg: -88,
    eccentricity: 0.2,
    argumentOfPerigeeDeg: 166,
  },
  {
    id: "sat-relay-3",
    radius: 1.69,
    speed: 0.028,
    phase: 5.1,
    inclinationDeg: 38,
    yawDeg: -116,
    eccentricity: 0.06,
    argumentOfPerigeeDeg: 62,
  },
  {
    id: "sat-relay-4",
    radius: 2.28,
    speed: 0.011,
    phase: 0.15,
    inclinationDeg: 63,
    yawDeg: -92,
    eccentricity: 0.28,
    argumentOfPerigeeDeg: 236,
  },
];

const SATELLITE_PAIRS: SatellitePair[] = SATELLITE_SPECS.map((_, i, all) => ({
  id: `sat-link-${i}-${(i + 1) % all.length}`,
  aIndex: i,
  bIndex: (i + 1) % all.length,
  phase: 0.2 + i * 0.83,
}));

const UP_AXIS = new Vector3(0, 1, 0);
const ALT_AXIS = new Vector3(1, 0, 0);
const SIGNAL_ARC_SEGMENTS = 18;
const SIGNAL_ARC_LIFT = 0.16;
const SIGNAL_CLEARANCE_RADIUS = 1.08;
const SATELLITE_SPEED_SCALE = 1 / 6;
const PLANET_BLOCK_RADIUS = 1.03;
const ACTIVE_LINKS_PER_NODE = 2;
const LOW_TIER_ACTIVE_LINKS_PER_NODE = 1;
const ARC_REBUILD_INTERVAL_ACTIVE_SEC = 1 / 30;
const ARC_REBUILD_INTERVAL_IDLE_SEC = 1 / 12;
const ARC_REBUILD_EPSILON_SQ = 0.00002;
const PACKET_GAUSS_SIGMA = 0.044;
const PACKET_CARRIER_PER_SIGMA = 1.22;
const PACKET_BURST_PEAK = 0.64;
const PACKET_BASELINE_RIPPLE_AMP = 0.036;
const PACKET_BASELINE_RIPPLE_FREQ = 2.65;
const RF_BASE_CYCLES = 5.35;
const RF_TIME_DRIFT_RAD_PER_SEC = 2.15;
const RF_PEAK = 0.54;
const RF_PACKET_BURST_GAIN = 0.82;
const RF_PACKET_RIPPLE_MIX = 0.58;
const INITIAL_LINE_POINTS = [new Vector3(0, 0, 0), new Vector3(0, 0, 0)] as const;

type MutableLineGeometry = {
  setPositions?: (pts: number[]) => void;
  setFromPoints?: (pts: Vector3[]) => void;
  attributes?: { position?: { needsUpdate?: boolean } };
  computeBoundingSphere?: () => void;
};

type LineLikeObject = {
  geometry?: MutableLineGeometry;
  material?: { opacity?: number; linewidth?: number };
};

type GroupLikeObject = {
  localToWorld: (point: Vector3) => Vector3;
};
const RF_LAYER_MULTIPATH_GAIN = 1.22;
const RF_CHAOS_GAIN = 1.45;
const PACKET_TRAVEL_SEC = 1.25;

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function packetBaselineRipple(s: number, phase: number): number {
  return (
    PACKET_BASELINE_RIPPLE_AMP *
    Math.sin(2 * Math.PI * PACKET_BASELINE_RIPPLE_FREQ * s + phase * 1.61 + 0.35)
  );
}

function rfHash01(k: number): number {
  const x = Math.sin(k * 127.1 + k * k * 0.0001 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function rfMultipathNormalOffset(s: number, timePhase: number, spatialPhase: number): number {
  const tau = 2 * Math.PI;
  const linkWin = 0.56 + 0.44 * Math.pow(Math.sin(Math.PI * clamp01(s)), 1.06);
  const t = timePhase;
  const sp = spatialPhase;
  const wobble =
    1 +
    0.18 * Math.sin(t * 0.52 + sp * 1.4 + s * 6.2) +
    0.11 * Math.sin(t * 0.89 - s * 4.7);
  const theta = tau * RF_BASE_CYCLES * s + spatialPhase + timePhase * 0.55;
  const mix =
    Math.sin(theta) * wobble +
    0.42 * Math.sin(theta * 1.036 + t * 1.14 + sp * 0.38 + Math.sin(t * 0.31) * 0.4) +
    0.3 * Math.sin(theta * 0.971 + t * -0.97 + sp * 0.55 + 1.05) +
    0.19 * Math.sin(theta * 1.058 + t * 0.51 + sp * 0.22 + 1.82) +
    0.12 * Math.sin(theta * 1.089 + t * -0.41 + sp * 0.71);
  return RF_PEAK * linkWin * mix * (1 / 2.03);
}

function rfChaosOffset(s: number, timePhase: number, spatialPhase: number): number {
  const tau = 2 * Math.PI;
  const t = timePhase;
  const sp = spatialPhase;
  const iq =
    1 +
    0.26 * Math.sin(t * 0.44 + sp * 1.35) +
    0.16 * Math.sin(t * 0.71 - sp * 0.92 + s * 3.1);
  let rug = 0;
  rug += 0.048 * Math.sin(tau * (27.3 * s + 4.2 * t) + t * 2.05 + sp);
  rug += 0.041 * Math.sin(tau * (41.7 * s - 3.5 * t + sp * 1.7));
  rug += 0.035 * Math.sin(tau * (19.1 * s + 7.4 * t + sp * 2.05));
  rug += 0.032 * Math.sin(tau * (53.2 * s + 1.65 * t));
  rug += 0.04 * Math.sin(tau * 11.9 * s + t * 5.6) * Math.sin(tau * 2.35 * s + t * 1.8);
  rug += 0.028 * Math.sin(tau * (33.8 * s - 2.2 * t + sp * 2.4));
  const flutter =
    0.022 * Math.sin(tau * (63 * s + 11.2 * t + sp)) +
    0.017 * Math.sin(tau * (71 * s - 8.1 * t + sp * 3.2)) +
    0.014 * Math.sin(tau * (88 * s + 6.3 * t));
  return RF_CHAOS_GAIN * iq * (rug + flutter);
}

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

type RfBurstShape = {
  centerJitter: number;
  sigmaScale: number;
  gain: number;
  carrierMul: number;
  phaseOff: number;
  h2w: number;
  envPow: number;
};

function rfBurstShape(burstKey: number, phase: number): RfBurstShape {
  const h = (n: number) => rfHash01(burstKey * 2654435761 + n * 1597334677);
  return {
    centerJitter: (h(1) - 0.5) * 0.05,
    sigmaScale: 0.82 + h(2) * 0.34,
    gain: RF_PACKET_BURST_GAIN * (0.62 + h(3) * 0.38),
    carrierMul: 0.82 + h(4) * 0.44,
    phaseOff: (h(5) - 0.5) * 5.5 + phase * 0.15 + h(6) * Math.PI,
    h2w: h(7) * 0.38,
    envPow: 0.82 + h(8) * 0.38,
  };
}

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

function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  // Newton solve for Kepler's equation: M = E - e sin(E).
  let eccentricAnomaly = meanAnomaly;
  for (let i = 0; i < 5; i += 1) {
    const f = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly;
    const fp = 1 - eccentricity * Math.cos(eccentricAnomaly);
    eccentricAnomaly -= f / Math.max(1e-6, fp);
  }
  return eccentricAnomaly;
}

function orbitPoint(spec: SatelliteSpec, theta: number, out: Vector3) {
  const eccentricity = Math.max(0, Math.min(0.85, spec.eccentricity ?? 0));
  const argumentOfPerigee = ((spec.argumentOfPerigeeDeg ?? 0) * Math.PI) / 180;
  if (eccentricity > 0) {
    const meanAnomaly = theta;
    const eccentricAnomaly = solveEccentricAnomaly(meanAnomaly, eccentricity);
    const trueAnomaly =
      2 *
      Math.atan2(
        Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomaly / 2),
        Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomaly / 2),
      );
    const radius = spec.radius * (1 - eccentricity * Math.cos(eccentricAnomaly));
    const orbitAngle = trueAnomaly + argumentOfPerigee;
    out.set(Math.cos(orbitAngle), 0, Math.sin(orbitAngle)).multiplyScalar(radius);
  } else {
    out.set(Math.cos(theta), 0, Math.sin(theta)).multiplyScalar(spec.radius);
  }
  out.applyAxisAngle(ALT_AXIS, (spec.inclinationDeg * Math.PI) / 180);
  out.applyAxisAngle(UP_AXIS, (spec.yawDeg * Math.PI) / 180);
  return out;
}

function buildSignalArcPoints(
  start: Vector3,
  end: Vector3,
  points: Vector3[],
  startDir: Vector3,
  endDir: Vector3,
  dirOut: Vector3,
  straight = false,
) {
  if (straight) {
    for (let i = 0; i <= SIGNAL_ARC_SEGMENTS; i += 1) {
      const t = i / SIGNAL_ARC_SEGMENTS;
      points[i].copy(start).lerp(end, t);
    }
    return;
  }
  const startLen = start.length();
  const endLen = end.length();
  startDir.copy(start).normalize();
  endDir.copy(end).normalize();
  for (let i = 0; i <= SIGNAL_ARC_SEGMENTS; i += 1) {
    const t = i / SIGNAL_ARC_SEGMENTS;
    // `Vector3.slerpVectors` is not available in all Three builds; use normalized blend.
    dirOut.copy(startDir).lerp(endDir, t).normalize();
    const baseRadius = startLen + (endLen - startLen) * t;
    const liftedRadius =
      Math.max(SIGNAL_CLEARANCE_RADIUS, baseRadius) + Math.sin(Math.PI * t) * SIGNAL_ARC_LIFT;
    points[i].copy(dirOut).multiplyScalar(liftedRadius);
  }
}

function pointOnArc(points: Vector3[], t: number, out: Vector3) {
  if (points.length === 0) return out.set(0, 0, 0);
  if (points.length === 1) return out.copy(points[0]);
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (points.length - 1);
  const i = Math.floor(scaled);
  const next = Math.min(points.length - 1, i + 1);
  const localT = scaled - i;
  return out.copy(points[i]).lerp(points[next], localT);
}

function setLineGeometryFromPoints(
  lineRef: { current: LineLikeObject | null },
  points: Vector3[],
  positions: number[],
) {
  const geometry = lineRef.current?.geometry;
  if (!geometry) return;
  if (typeof geometry.setPositions === "function") {
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i];
      const base = i * 3;
      positions[base] = p.x;
      positions[base + 1] = p.y;
      positions[base + 2] = p.z;
    }
    geometry.setPositions(positions);
    geometry.computeBoundingSphere?.();
    return;
  }
  if (typeof geometry.setFromPoints === "function") {
    geometry.setFromPoints(points);
    if (geometry.attributes?.position) geometry.attributes.position.needsUpdate = true;
  }
}

function segmentClearsPlanet(start: Vector3, end: Vector3, blockRadius: number): boolean {
  const d = end.clone().sub(start);
  const denom = d.lengthSq();
  if (denom <= 1e-8) return false;
  const t = Math.max(0, Math.min(1, -start.dot(d) / denom));
  const closest = start.clone().addScaledVector(d, t);
  return closest.lengthSq() > blockRadius * blockRadius;
}

function SignalLine({
  startRef,
  endRef,
  phase,
  signalColor,
  reducedMotion,
  alwaysVisible = false,
  emphasize = false,
  showWaveWhenReduced = false,
  solid = false,
  straight = false,
  depthOcclude = false,
  halo = false,
  requireClearPath = false,
  requireFullLineVisible = false,
  orbitStyle = false,
  signalOpacity = 0.72,
  signalLineWidth = 2.35,
  rfOpacity = 0.84,
  rfLineWidth = 2.35,
  linkKey,
  activeLinkKeysRef,
  idleOpacity = 0.08,
  idleLineWidth = 0.2,
  requireActiveSatPair = false,
  activeSatIndicesRef,
  satPairAIndex,
  satPairBIndex,
  lowQuality = false,
}: {
  startRef: MutableRefObject<Vector3>;
  endRef: MutableRefObject<Vector3>;
  phase: number;
  signalColor: Color;
  reducedMotion: boolean;
  alwaysVisible?: boolean;
  emphasize?: boolean;
  showWaveWhenReduced?: boolean;
  solid?: boolean;
  straight?: boolean;
  depthOcclude?: boolean;
  halo?: boolean;
  requireClearPath?: boolean;
  requireFullLineVisible?: boolean;
  orbitStyle?: boolean;
  signalOpacity?: number;
  signalLineWidth?: number;
  rfOpacity?: number;
  rfLineWidth?: number;
  linkKey?: string;
  activeLinkKeysRef?: MutableRefObject<Set<string>>;
  idleOpacity?: number;
  idleLineWidth?: number;
  requireActiveSatPair?: boolean;
  activeSatIndicesRef?: MutableRefObject<Set<number>>;
  satPairAIndex?: number;
  satPairBIndex?: number;
  lowQuality?: boolean;
}) {
  const signalLineRef = useRef<LineLikeObject | null>(null);
  const rfLineRef = useRef<LineLikeObject | null>(null);
  const pulseRef = useRef<Mesh>(null);
  const waveDotsRef = useRef<Array<Mesh | null>>([]);
  const startTmpRef = useRef(new Vector3());
  const endTmpRef = useRef(new Vector3());
  const pointTmpRef = useRef(new Vector3());
  const dirRef = useRef(new Vector3());
  const normalRef = useRef(new Vector3());
  const baseRef = useRef(new Vector3());
  const startDirRef = useRef(new Vector3());
  const endDirRef = useRef(new Vector3());
  const arcDirRef = useRef(new Vector3());
  const arcPointsRef = useRef(
    Array.from({ length: SIGNAL_ARC_SEGMENTS + 1 }, () => new Vector3()),
  );
  const signalGroupRef = useRef<GroupLikeObject | null>(null);
  const linePositionsRef = useRef<number[]>(
    Array.from({ length: (SIGNAL_ARC_SEGMENTS + 1) * 3 }, () => 0),
  );
  const rfLinePositionsRef = useRef<number[]>(
    Array.from({ length: (SIGNAL_ARC_SEGMENTS + 1) * 3 }, () => 0),
  );
  const rfPointsRef = useRef(Array.from({ length: SIGNAL_ARC_SEGMENTS + 1 }, () => new Vector3()));
  const tmpPrevRef = useRef(new Vector3());
  const tmpNextRef = useRef(new Vector3());
  const tmpTangentRef = useRef(new Vector3());
  const tmpNormalRef = useRef(new Vector3());
  const worldStartRef = useRef(new Vector3());
  const worldEndRef = useRef(new Vector3());
  const worldMidRef = useRef(new Vector3());
  const tangentFromRef = useRef(new Vector3());
  const tangentToRef = useRef(new Vector3());
  const camDirRef = useRef(new Vector3());
  const midRef = useRef(new Vector3());
  const previousStartRef = useRef(new Vector3());
  const previousEndRef = useRef(new Vector3());
  const previousArcValidRef = useRef(false);
  const arcRebuildAccumRef = useRef(0);

  useFrame((state, delta) => {
    const { clock, camera } = state;
    const t = clock.elapsedTime;
    const linkSelected = !linkKey || !activeLinkKeysRef || activeLinkKeysRef.current.has(linkKey);
    startTmpRef.current.copy(startRef.current);
    endTmpRef.current.copy(endRef.current);
    arcRebuildAccumRef.current += delta;
    const startMoved =
      previousArcValidRef.current &&
      previousStartRef.current.distanceToSquared(startTmpRef.current) > ARC_REBUILD_EPSILON_SQ;
    const endMoved =
      previousArcValidRef.current &&
      previousEndRef.current.distanceToSquared(endTmpRef.current) > ARC_REBUILD_EPSILON_SQ;
    const rebuildInterval =
      linkSelected || !lowQuality ? ARC_REBUILD_INTERVAL_ACTIVE_SEC : ARC_REBUILD_INTERVAL_IDLE_SEC;
    const shouldRebuildArc =
      !previousArcValidRef.current ||
      startMoved ||
      endMoved ||
      arcRebuildAccumRef.current >= rebuildInterval;
    if (shouldRebuildArc) {
      buildSignalArcPoints(
        startTmpRef.current,
        endTmpRef.current,
        arcPointsRef.current,
        startDirRef.current,
        endDirRef.current,
        arcDirRef.current,
        straight,
      );
      previousStartRef.current.copy(startTmpRef.current);
      previousEndRef.current.copy(endTmpRef.current);
      previousArcValidRef.current = true;
      arcRebuildAccumRef.current = 0;
      setLineGeometryFromPoints(signalLineRef, arcPointsRef.current, linePositionsRef.current);
    }
    camDirRef.current.copy(camera.position).normalize();
    pointOnArc(arcPointsRef.current, 0.5, midRef.current);
    worldStartRef.current.copy(startTmpRef.current);
    worldEndRef.current.copy(endTmpRef.current);
    worldMidRef.current.copy(midRef.current);
    const signalGroup = signalGroupRef.current;
    if (signalGroup) {
      signalGroup.localToWorld(worldStartRef.current);
      signalGroup.localToWorld(worldEndRef.current);
      signalGroup.localToWorld(worldMidRef.current);
    }
    const startFacing = worldStartRef.current.normalize().dot(camDirRef.current);
    const endFacing = worldEndRef.current.normalize().dot(camDirRef.current);
    const midFacing = worldMidRef.current.normalize().dot(camDirRef.current);
    const baseVisible = alwaysVisible || Math.max(startFacing, endFacing, midFacing) > -0.06;
    const pathClear = !requireClearPath
      ? true
      : segmentClearsPlanet(startTmpRef.current, endTmpRef.current, PLANET_BLOCK_RADIUS);
    const fullLineVisible = !requireFullLineVisible
      ? true
      : startFacing > 0 && endFacing > 0 && midFacing > 0;
    const activeSatPair =
      !requireActiveSatPair ||
      !activeSatIndicesRef ||
      satPairAIndex === undefined ||
      satPairBIndex === undefined
        ? true
        : activeSatIndicesRef.current.has(satPairAIndex) &&
          activeSatIndicesRef.current.has(satPairBIndex);
    const lineVisible = baseVisible && pathClear && fullLineVisible && activeSatPair;

    const rfPoints = rfPointsRef.current;
    const packetCenter = 0.065 + ((t % PACKET_TRAVEL_SEC) / PACKET_TRAVEL_SEC) * 0.87;
    const timePhase = t * RF_TIME_DRIFT_RAD_PER_SEC;
    const spatialPhase =
      startTmpRef.current.x * 0.092 +
      startTmpRef.current.y * 0.068 +
      endTmpRef.current.z * 0.057;
    const burstKey = ((Math.floor(t / PACKET_TRAVEL_SEC) * 1009 + Math.floor(phase * 997)) | 0) >>> 0;
    const burstShape = rfBurstShape(burstKey, phase);
    for (let i = 0; i <= SIGNAL_ARC_SEGMENTS; i += 1) {
      const s = i / SIGNAL_ARC_SEGMENTS;
      const base = arcPointsRef.current[i];
      const prev = tmpPrevRef.current.copy(arcPointsRef.current[Math.max(0, i - 1)]);
      const next = tmpNextRef.current.copy(
        arcPointsRef.current[Math.min(SIGNAL_ARC_SEGMENTS, i + 1)],
      );
      const tangent = tmpTangentRef.current.copy(next).sub(prev).normalize();
      const normal = tmpNormalRef.current.copy(base).normalize();
      if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0);
      // Sat->ground links use a scaled-down version of the main RF connector profile,
      // but with enough displacement to visibly read as an active signal.
      const rfLayer = rfLayerNormalOffset(s, phase, timePhase, spatialPhase) * 0.082;
      const burst = straightBurstNormalOffset(s, packetCenter, phase, burstShape) * 0.094;
      const mixedOffset = rfLayer + burst;
      rfPoints[i]
        .copy(base)
        .addScaledVector(normal, mixedOffset)
        .addScaledVector(tangent, Math.abs(burst) * 0.0065);
    }
    if (shouldRebuildArc || linkSelected) {
      setLineGeometryFromPoints(rfLineRef, rfPoints, rfLinePositionsRef.current);
    }

    if (signalLineRef.current?.material) {
      const flicker = 0;
      const baseOpacity = !linkSelected
        ? idleOpacity
        : orbitStyle
          ? 0.22
          : solid
            ? 1
            : emphasize
              ? 0.82
              : signalOpacity;
      signalLineRef.current.material.opacity = lineVisible ? baseOpacity + flicker : 0;
      if (!orbitStyle && !solid) {
        signalLineRef.current.material.linewidth = linkSelected ? signalLineWidth : idleLineWidth;
      }
    }
    if (rfLineRef.current?.material) {
      rfLineRef.current.material.opacity =
        lineVisible && linkSelected ? (solid || orbitStyle ? 0 : rfOpacity) : 0;
      if (!orbitStyle && !solid) {
        rfLineRef.current.material.linewidth = linkSelected ? rfLineWidth : idleLineWidth;
      }
    }

    if (pulseRef.current) {
      const pulseSpeed = reducedMotion ? (showWaveWhenReduced ? 0.038 : 0.025) : 0.065;
      const pulseT = (t * pulseSpeed + phase * 0.13) % 1;
      pointOnArc(arcPointsRef.current, pulseT, pointTmpRef.current);
      pulseRef.current.position.copy(pointTmpRef.current);
      pulseRef.current.visible = false;
    }

    const showWave = false && !solid && lineVisible && (!reducedMotion || showWaveWhenReduced);
    if (showWave) {
      for (let i = 0; i < 5; i += 1) {
        const dot = waveDotsRef.current[i];
        if (!dot) continue;
        const waveSpeed = reducedMotion ? 0.05 : 0.08;
        const p = ((i / 5) + t * waveSpeed + phase * 0.1) % 1;
        pointOnArc(arcPointsRef.current, p, baseRef.current);
        pointOnArc(arcPointsRef.current, Math.max(0, p - 0.03), tangentFromRef.current);
        pointOnArc(arcPointsRef.current, Math.min(1, p + 0.03), tangentToRef.current);
        dirRef.current.copy(tangentToRef.current).sub(tangentFromRef.current).normalize();
        normalRef.current.copy(baseRef.current).normalize();
        if (normalRef.current.lengthSq() < 1e-6) {
          normalRef.current.crossVectors(dirRef.current, UP_AXIS);
          if (normalRef.current.lengthSq() < 1e-6) {
            normalRef.current.crossVectors(dirRef.current, ALT_AXIS);
          }
          normalRef.current.normalize();
        }
        const wavePhase = p * Math.PI * 8 - t * 4.6 + phase;
        const amp = 0.0065 * Math.sin(wavePhase);
        dot.position.copy(baseRef.current).addScaledVector(normalRef.current, amp);
        dot.visible = true;
      }
    } else {
      waveDotsRef.current.forEach((dot) => {
        if (dot) dot.visible = false;
      });
    }
  });

  return (
    <group
      ref={(node) => {
        signalGroupRef.current = node as unknown as GroupLikeObject | null;
      }}
    >
      {halo ? (
        <Line
          points={INITIAL_LINE_POINTS}
          color={signalColor}
          transparent
          opacity={0.3}
          lineWidth={3.8}
          depthTest={depthOcclude}
          depthWrite={false}
        />
      ) : null}
      <Line
        ref={(node) => {
          rfLineRef.current = node as unknown as LineLikeObject | null;
        }}
        points={INITIAL_LINE_POINTS}
        color={signalColor}
        transparent
        opacity={0}
        lineWidth={solid || orbitStyle ? 0 : rfLineWidth}
        depthTest={depthOcclude}
        depthWrite={false}
      />
      <Line
        ref={(node) => {
          signalLineRef.current = node as unknown as LineLikeObject | null;
        }}
        points={INITIAL_LINE_POINTS}
        color={signalColor}
        transparent
        opacity={orbitStyle ? 0.22 : solid ? 1 : signalOpacity}
        lineWidth={orbitStyle ? 0.8 : solid ? 2.45 : signalLineWidth}
        depthTest={depthOcclude}
        depthWrite={false}
      />
      <mesh ref={pulseRef} raycast={() => null}>
        <sphereGeometry args={[0.0052, 10, 10]} />
        <meshBasicMaterial
          color={signalColor}
          toneMapped={false}
          transparent
          opacity={0.9}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh
          key={`wave-dot-${i}`}
          ref={(node) => {
            waveDotsRef.current[i] = node;
          }}
          visible={false}
          raycast={() => null}
        >
          <sphereGeometry args={[0.0028, 8, 8]} />
          <meshBasicMaterial
            color={signalColor}
            toneMapped={false}
            transparent
            opacity={0.72}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function OrbitalSatellites({ accentColor, reducedMotion, isMobile }: OrbitalSatellitesProps) {
  const accent = useMemo(() => new Color().setStyle(accentColor), [accentColor]);
  const signalColor = useMemo(
    () => accent.clone().lerp(new Color("white"), 0.14),
    [accent],
  );
  const lowQualityTier = useMemo(() => {
    if (reducedMotion || isMobile) return true;
    if (typeof navigator === "undefined") return false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const deviceMemory = nav.deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    return deviceMemory < 8 || cores < 8;
  }, [isMobile, reducedMotion]);
  const nodeAnchors = useMemo(() => {
    const map = new Map<string, MutableRefObject<Vector3>>();
    for (const node of resumeNodes) {
      if (node.id === "about" || node.id === "experience" || node.id === "projects") {
        map.set(`main:${node.id}`, { current: latLonToVector3(node.latitude, node.longitude, 1.11) });
      }
    }
    return map;
  }, []);
  const nodeAnchorEntries = useMemo(() => Array.from(nodeAnchors.entries()), [nodeAnchors]);
  const satPositionRefs = useMemo(
    () => SATELLITE_SPECS.map(() => ({ current: new Vector3() })),
    [],
  );
  const satMeshRefs = useRef<Array<Mesh | null>>([]);
  const orbitLineRefs = useRef<Array<LineLikeObject | null>>([]);
  const activeNodeLinkKeysRef = useRef<Set<string>>(new Set());
  const activeSatIndicesRef = useRef<Set<number>>(new Set());
  const orbitTrackPoints = useMemo(() => {
    return SATELLITE_SPECS.map((spec) => {
      const points: Vector3[] = [];
      for (let i = 0; i <= 96; i += 1) {
        const theta = (i / 96) * Math.PI * 2;
        points.push(orbitPoint(spec, theta, new Vector3()));
      }
      return points;
    });
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    SATELLITE_SPECS.forEach((spec, i) => {
      const omega = (reducedMotion ? spec.speed * 0.45 : spec.speed) * SATELLITE_SPEED_SCALE;
      const theta = t * omega * Math.PI * 2 + spec.phase;
      orbitPoint(spec, theta, satPositionRefs[i].current);
      const satMesh = satMeshRefs.current[i];
      if (satMesh) {
        satMesh.position.copy(satPositionRefs[i].current);
        const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 2.9 + spec.phase) * 0.06;
        satMesh.scale.setScalar(pulse);
      }
    });

    const nextActive = new Set<string>();
    const nextActiveSatIndices = new Set<number>();
    for (const [anchorKey, targetRef] of nodeAnchorEntries) {
      const candidates: Array<{ key: string; score: number; satIndex: number }> = [];
      SATELLITE_SPECS.forEach((spec, satIndex) => {
        const satPos = satPositionRefs[satIndex].current;
        if (!segmentClearsPlanet(targetRef.current, satPos, PLANET_BLOCK_RADIUS)) return;
        const distance = targetRef.current.distanceTo(satPos);
        // Prefer short, high-clearance relay paths for "best connection" selection.
        const altitudeBias = Math.max(0, satPos.length() - 1);
        const score = 1 / Math.max(0.001, distance) + altitudeBias * 0.08;
        candidates.push({
          key: `${spec.id}-${anchorKey}-node-link`,
          score,
          satIndex,
        });
      });
      candidates.sort((a, b) => b.score - a.score);
      const maxActiveLinks = lowQualityTier ? LOW_TIER_ACTIVE_LINKS_PER_NODE : ACTIVE_LINKS_PER_NODE;
      for (let i = 0; i < Math.min(maxActiveLinks, candidates.length); i += 1) {
        nextActive.add(candidates[i].key);
        nextActiveSatIndices.add(candidates[i].satIndex);
      }
    }
    activeNodeLinkKeysRef.current = nextActive;
    activeSatIndicesRef.current = nextActiveSatIndices;

    orbitLineRefs.current.forEach((orbitLine, satIndex) => {
      if (!orbitLine?.material) return;
      const isActiveSat = activeSatIndicesRef.current.has(satIndex);
      orbitLine.material.opacity = isActiveSat ? 0.22 : 0.06;
    });
  });

  return (
    <group>
      {orbitTrackPoints.map((track, i) => (
        <Line
          key={`${SATELLITE_SPECS[i].id}-orbit`}
          ref={(node) => {
            orbitLineRefs.current[i] = node;
          }}
          points={track}
          color={signalColor}
          transparent
          opacity={0.22}
          lineWidth={0.8}
          depthTest
        />
      ))}

      {SATELLITE_SPECS.map((spec, i) => (
        <mesh
          key={`${spec.id}-body`}
          ref={(node) => {
            satMeshRefs.current[i] = node;
          }}
          raycast={() => null}
        >
          <sphereGeometry args={[0.0155, 14, 14]} />
          <meshBasicMaterial
            color={signalColor}
            toneMapped={false}
            transparent
            opacity={0.95}
            depthWrite={false}
            depthTest
          />
        </mesh>
      ))}

      {SATELLITE_SPECS.map((spec, satIndex) =>
        nodeAnchorEntries.map(([anchorKey, targetRef], anchorIndex) => (
          <SignalLine
            key={`${spec.id}-${anchorKey}-node-link`}
            startRef={targetRef}
            endRef={satPositionRefs[satIndex]}
            phase={spec.phase + anchorIndex * 0.17}
            signalColor={signalColor}
            reducedMotion={reducedMotion}
            straight
            depthOcclude
            requireClearPath
            signalOpacity={0.34}
            signalLineWidth={0.95}
            rfOpacity={0.58}
            rfLineWidth={0.95}
            linkKey={`${spec.id}-${anchorKey}-node-link`}
            activeLinkKeysRef={activeNodeLinkKeysRef}
            idleOpacity={0.07}
            idleLineWidth={0.14}
            lowQuality={lowQualityTier}
          />
        )),
      )}

      {!lowQualityTier
        ? SATELLITE_PAIRS.map((pair) => (
            <SignalLine
              key={pair.id}
              startRef={satPositionRefs[pair.aIndex]}
              endRef={satPositionRefs[pair.bIndex]}
              phase={pair.phase}
              signalColor={signalColor}
              reducedMotion={reducedMotion}
              alwaysVisible
              straight
              requireClearPath
              requireFullLineVisible
              orbitStyle
              requireActiveSatPair
              activeSatIndicesRef={activeSatIndicesRef}
              satPairAIndex={pair.aIndex}
              satPairBIndex={pair.bIndex}
              lowQuality={lowQualityTier}
            />
          ))
        : null}
    </group>
  );
}
