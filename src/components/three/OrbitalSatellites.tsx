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
  planeIndex: number;
  slotIndex: number;
  layer: "inner" | "core" | "outer" | "drifter";
  eccentricity?: number;
  argumentOfPerigeeDeg?: number;
};

type SatelliteLinkCandidate = {
  id: string;
  aIndex: number;
  bIndex: number;
  phase: number;
  baseScore: number;
  kind: "backbone" | "access";
};

function idHash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

function jitter(id: string, amount: number): number {
  return (idHash01(id) - 0.5) * 2 * amount;
}

type PlanePreset = {
  count: number;
  radius: number;
  speed: number;
  inclinationDeg: number;
  yawDeg: number;
  phaseOffset: number;
  layer: SatelliteSpec["layer"];
  eccentricityBase: number;
  eccentricityJitter: number;
  radiusJitter: number;
  inclinationJitter: number;
  yawJitter: number;
  phaseJitterDeg: number;
};

const UNIQUE_CONSTELLATION_PRESET: PlanePreset[] = [
  // Primary mid-inclination backbone plane.
  {
    count: 4,
    radius: 2.08,
    speed: 0.0154,
    inclinationDeg: 46,
    yawDeg: -112,
    phaseOffset: 0.14,
    layer: "core",
    eccentricityBase: 0.022,
    eccentricityJitter: 0.01,
    radiusJitter: 0.022,
    inclinationJitter: 1.9,
    yawJitter: 1.7,
    phaseJitterDeg: 3.6,
  },
  // Secondary high-inclination plane for strong angle contrast.
  {
    count: 4,
    radius: 2.2,
    speed: 0.0135,
    inclinationDeg: 70,
    yawDeg: -28,
    phaseOffset: 0.72,
    layer: "core",
    eccentricityBase: 0.038,
    eccentricityJitter: 0.014,
    radiusJitter: 0.024,
    inclinationJitter: 2.1,
    yawJitter: 1.9,
    phaseJitterDeg: 4.0,
  },
  // Low-inclination counter plane to prevent "all polar" feel.
  {
    count: 3,
    radius: 2.26,
    speed: 0.0128,
    inclinationDeg: 26,
    yawDeg: 58,
    phaseOffset: 1.48,
    layer: "outer",
    eccentricityBase: 0.052,
    eccentricityJitter: 0.018,
    radiusJitter: 0.026,
    inclinationJitter: 2.4,
    yawJitter: 2.2,
    phaseJitterDeg: 4.8,
  },
  // Sparse relay/drifter plane for longer arcs and variety.
  {
    count: 2,
    radius: 2.42,
    speed: 0.0112,
    inclinationDeg: 84,
    yawDeg: 112,
    phaseOffset: 2.08,
    layer: "drifter",
    eccentricityBase: 0.088,
    eccentricityJitter: 0.03,
    radiusJitter: 0.03,
    inclinationJitter: 2.7,
    yawJitter: 2.6,
    phaseJitterDeg: 5.3,
  },
];

function seedSpreadAngles(prefix: string, count: number, minGapRad: number): number[] {
  if (count <= 1) return [0];
  const base = Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2);
  const result = [...base];
  for (let i = 0; i < count; i += 1) {
    let best = result[i];
    let bestMinGap = -1;
    const baseAngle = result[i];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const cand =
        baseAngle + ((jitter(`${prefix}-phase-${i}-attempt-${attempt}`, 1) * Math.PI) / 180) * 7.5;
      let localGap = Number.POSITIVE_INFINITY;
      for (let j = 0; j < count; j += 1) {
        if (j === i) continue;
        const raw = Math.abs(cand - result[j]) % (Math.PI * 2);
        const dist = Math.min(raw, Math.PI * 2 - raw);
        localGap = Math.min(localGap, dist);
      }
      if (localGap > bestMinGap && localGap >= minGapRad * 0.72) {
        best = cand;
        bestMinGap = localGap;
      }
    }
    result[i] = best;
  }
  return result;
}

function buildUniqueSatelliteSpecs(): SatelliteSpec[] {
  const presets = UNIQUE_CONSTELLATION_PRESET;
  const planeCount = presets.length;
  const planeYawSpanDeg = 180;
  const specs: SatelliteSpec[] = [];
  presets.forEach((plane, p) => {
    const phaseAngles = seedSpreadAngles(`constellation-plane-${p + 1}`, plane.count, 0.42);
    for (let s = 0; s < plane.count; s += 1) {
      const id = `constellation-p${p + 1}-s${s + 1}`;
      // Keep constellation structure, but offset each satellite's plane slightly
      // so they do not read like perfectly stacked coplanar rings.
      const slotBlend = plane.count <= 1 ? 0 : s / (plane.count - 1) - 0.5;
      const microPlaneInclination = slotBlend * 2.6;
      const microPlaneYaw = slotBlend * 3.2;
      const planeBlend = planeCount <= 1 ? 0 : p / (planeCount - 1) - 0.5;
      const majorPlaneYaw = planeBlend * planeYawSpanDeg;
      const majorPlaneInclination = Math.sin((p + 1) * 1.37) * 4.6;
      specs.push({
        id,
        radius: plane.radius + jitter(`${id}-r`, plane.radiusJitter),
        speed: plane.speed,
        phase:
          phaseAngles[s] + plane.phaseOffset + ((jitter(`${id}-phase-fine`, 1) * Math.PI) / 180) * 0.5,
        inclinationDeg:
          plane.inclinationDeg +
          majorPlaneInclination +
          microPlaneInclination +
          jitter(`${id}-inc`, plane.inclinationJitter),
        yawDeg: plane.yawDeg + majorPlaneYaw + microPlaneYaw + jitter(`${id}-yaw`, plane.yawJitter),
        planeIndex: p,
        slotIndex: s,
        layer: plane.layer,
        eccentricity: Math.max(0.006, plane.eccentricityBase + jitter(`${id}-ecc`, plane.eccentricityJitter)),
        argumentOfPerigeeDeg: ((idHash01(`${id}-arg`) * 360) % 360 + 360) % 360,
      });
    }
  });

  return specs;
}

function buildSatelliteLinkCandidates(specs: SatelliteSpec[]): SatelliteLinkCandidate[] {
  const referencePositions = specs.map((spec) => orbitPoint(spec, spec.phase, new Vector3()));
  const seen = new Set<string>();
  const candidates: SatelliteLinkCandidate[] = [];
  const satellitesByPlane = new Map<number, Array<{ index: number; spec: SatelliteSpec }>>();
  specs.forEach((spec, index) => {
    if (!satellitesByPlane.has(spec.planeIndex)) satellitesByPlane.set(spec.planeIndex, []);
    satellitesByPlane.get(spec.planeIndex)?.push({ index, spec });
  });
  satellitesByPlane.forEach((list) => list.sort((a, b) => a.spec.slotIndex - b.spec.slotIndex));
  const orderedPlanes = Array.from(satellitesByPlane.keys()).sort((a, b) => a - b);

  const pushEdge = (aIndex: number, bIndex: number, kind: SatelliteLinkCandidate["kind"], score: number) => {
    if (aIndex === bIndex) return;
    const lo = Math.min(aIndex, bIndex);
    const hi = Math.max(aIndex, bIndex);
    const key = `${lo}-${hi}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      id: `sat-link-${lo}-${hi}`,
      aIndex: lo,
      bIndex: hi,
      phase: 0.17 + (lo + hi) * 0.31,
      baseScore: score,
      kind,
    });
  };

  specs.forEach((spec, i) => {
    const samePlane = satellitesByPlane.get(spec.planeIndex) ?? [];
    if (samePlane.length > 0) {
      const localIdx = samePlane.findIndex((entry) => entry.index === i);
      const next = samePlane[(localIdx + 1 + samePlane.length) % samePlane.length];
      const prev = samePlane[(localIdx - 1 + samePlane.length) % samePlane.length];
      pushEdge(i, next.index, "backbone", 2.45);
      pushEdge(i, prev.index, "backbone", 2.25);
    }

    const planeOrderIdx = orderedPlanes.findIndex((planeIdx) => planeIdx === spec.planeIndex);
    const adjacentPlanes = [
      orderedPlanes[(planeOrderIdx + 1) % orderedPlanes.length],
      orderedPlanes[(planeOrderIdx - 1 + orderedPlanes.length) % orderedPlanes.length],
    ];
    adjacentPlanes.forEach((planeIdx, step) => {
      const planeSats = satellitesByPlane.get(planeIdx);
      if (!planeSats || planeSats.length === 0) return;
      const aligned =
        planeSats[
          Math.floor((spec.slotIndex / Math.max(1, samePlane.length)) * planeSats.length) %
            planeSats.length
        ];
      const diagonal =
        planeSats[
          (aligned.spec.slotIndex + (step === 0 ? 1 : -1) + planeSats.length) % planeSats.length
        ];
      pushEdge(i, aligned.index, "backbone", 2.35);
      pushEdge(i, diagonal.index, "access", 1.65);
    });

    const neighbors = specs
      .map((other, j) => ({ j, other }))
      .filter(({ j }) => j !== i)
      .map(({ j, other }) => {
        const distance = referencePositions[i].distanceTo(referencePositions[j]);
        const crossPlane = other.planeIndex === spec.planeIndex ? 0 : 1;
        return { j, distance, crossPlane };
      })
      .sort((a, b) => a.distance - b.distance);
    neighbors
      .slice(0, 3)
      .forEach(({ j, crossPlane }) =>
        pushEdge(i, j, crossPlane ? "access" : "backbone", 1.3 + crossPlane * 0.65),
      );
    neighbors
      .filter(({ crossPlane }) => crossPlane === 1)
      .slice(0, 1)
      .forEach(({ j }) => pushEdge(i, j, "access", 1.5));
  });

  return candidates;
}

const UP_AXIS = new Vector3(0, 1, 0);
const ALT_AXIS = new Vector3(1, 0, 0);
const SIGNAL_ARC_SEGMENTS = 28;
const SIGNAL_ARC_LIFT = 0.16;
const SIGNAL_CLEARANCE_RADIUS = 1.08;
const SATELLITE_SPEED_SCALE = 1 / 6;
const PLANET_BLOCK_RADIUS = 1.03;
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
// Microwave ripple profile for "live" active links.
const MICROWAVE_WAVE_CYCLES = 34;
const MICROWAVE_WAVE_SPEED = 6.4;
const MICROWAVE_WAVE_AMP = 0.0016;
const MICROWAVE_WAVE_AMP_REDUCED = 0.0009;
// Extra ripple gain when a link is marked as actively carrying path traffic.
const MICROWAVE_ACTIVE_LINK_BOOST = 1.35;
// Orbit-track rendering is split into this many segments for per-segment fading.
const ORBIT_SEGMENT_COUNT = 96;
// Higher values shorten the bright "recently traveled" trail.
const ORBIT_TRAIL_DECAY = 2.7;
// Active satellite orbit brightness floor + additive trail peak.
const ORBIT_ACTIVE_BASE_OPACITY = 0.28;
const ORBIT_ACTIVE_TRAIL_GAIN = 0.34;
// Inactive satellite orbit brightness floor + additive trail peak.
const ORBIT_INACTIVE_BASE_OPACITY = 0;
const ORBIT_INACTIVE_TRAIL_GAIN = 0;
const NETWORK_SOLVE_INTERVAL_SEC = 0.32;
const NETWORK_SOLVE_INTERVAL_LOW_QUALITY_SEC = 0.48;
const EDGE_PROMOTE_SCORE = 0.7;
const EDGE_DEMOTE_SCORE = 0.47;
const EDGE_TTL_SEC = 1.35;
const BACKBONE_DEGREE_LIMIT = 4;

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

function buildSatAdjacency(
  activeEdgeIds: Set<string>,
  linksById: Map<string, SatelliteLinkCandidate>,
  satCount: number,
) {
  const adjacency = Array.from({ length: satCount }, () => new Map<number, string>());
  activeEdgeIds.forEach((edgeId) => {
    const edge = linksById.get(edgeId);
    if (!edge) return;
    adjacency[edge.aIndex].set(edge.bIndex, edgeId);
    adjacency[edge.bIndex].set(edge.aIndex, edgeId);
  });
  return adjacency;
}

function satComponents(adjacency: Array<Map<number, string>>): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];
  for (let i = 0; i < adjacency.length; i += 1) {
    if (visited.has(i)) continue;
    const stack = [i];
    const component: number[] = [];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined || visited.has(node)) continue;
      visited.add(node);
      component.push(node);
      adjacency[node].forEach((_, nextNode) => {
        if (!visited.has(nextNode)) stack.push(nextNode);
      });
    }
    components.push(component);
  }
  return components;
}

function shortestSatPathEdgeIds(
  start: number,
  goal: number,
  adjacency: Array<Map<number, string>>,
  linksById: Map<string, SatelliteLinkCandidate>,
  satPositions: MutableRefObject<Vector3>[],
): string[] {
  if (start === goal) return [];
  const n = adjacency.length;
  const dist = Array.from({ length: n }, () => Number.POSITIVE_INFINITY);
  const prevNode = Array.from({ length: n }, () => -1);
  const prevEdge = Array.from({ length: n }, () => "");
  const open = new Set<number>();
  dist[start] = 0;
  open.add(start);

  while (open.size > 0) {
    let current = -1;
    let best = Number.POSITIVE_INFINITY;
    open.forEach((candidate) => {
      if (dist[candidate] < best) {
        best = dist[candidate];
        current = candidate;
      }
    });
    if (current < 0) break;
    open.delete(current);
    if (current === goal) break;
    adjacency[current].forEach((edgeId, nextNode) => {
      const edge = linksById.get(edgeId);
      if (!edge) return;
      const weight =
        satPositions[edge.aIndex].current.distanceTo(satPositions[edge.bIndex].current) +
        (edge.kind === "access" ? 0.18 : 0);
      const nextDist = dist[current] + weight;
      if (nextDist < dist[nextNode]) {
        dist[nextNode] = nextDist;
        prevNode[nextNode] = current;
        prevEdge[nextNode] = edgeId;
        open.add(nextNode);
      }
    });
  }

  if (!Number.isFinite(dist[goal])) return [];
  const path: string[] = [];
  let node = goal;
  while (node !== start) {
    const edgeId = prevEdge[node];
    const parent = prevNode[node];
    if (!edgeId || parent < 0) return [];
    path.push(edgeId);
    node = parent;
  }
  path.reverse();
  return path;
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
  orbitLineWidth = 0.8,
  signalOpacity = 0.72,
  signalLineWidth = 2.35,
  rfOpacity = 0.84,
  rfLineWidth = 2.35,
  linkKey,
  activeLinkKeysRef,
  activeNoiseLinkKeysRef,
  idleOpacity = 0.08,
  idleLineWidth = 0.2,
  requireActiveSatPair = false,
  activeSatIndicesRef,
  satPairAIndex,
  satPairBIndex,
  lowQuality = false,
  microwaveStyle = false,
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
  orbitLineWidth?: number;
  signalOpacity?: number;
  signalLineWidth?: number;
  rfOpacity?: number;
  rfLineWidth?: number;
  linkKey?: string;
  activeLinkKeysRef?: MutableRefObject<Set<string>>;
  activeNoiseLinkKeysRef?: MutableRefObject<Set<string>>;
  idleOpacity?: number;
  idleLineWidth?: number;
  requireActiveSatPair?: boolean;
  activeSatIndicesRef?: MutableRefObject<Set<number>>;
  satPairAIndex?: number;
  satPairBIndex?: number;
  lowQuality?: boolean;
  microwaveStyle?: boolean;
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
    const noiseSelected =
      !linkKey || !activeNoiseLinkKeysRef || activeNoiseLinkKeysRef.current.has(linkKey);
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
      // Inter-satellite links read better with very tight microwave ripples.
      const microwaveAmpBase = reducedMotion ? MICROWAVE_WAVE_AMP_REDUCED : MICROWAVE_WAVE_AMP;
      const microwaveAmp = noiseSelected ? microwaveAmpBase * MICROWAVE_ACTIVE_LINK_BOOST : 0;
      const microwaveWave =
        Math.sin(2 * Math.PI * MICROWAVE_WAVE_CYCLES * s - timePhase * MICROWAVE_WAVE_SPEED + phase) *
        microwaveAmp;
      const microwaveBeat =
        Math.sin(
          2 *
            Math.PI *
            (MICROWAVE_WAVE_CYCLES * 0.37) *
            s +
            timePhase * (MICROWAVE_WAVE_SPEED * 0.72) +
            phase * 1.3,
        ) *
        (microwaveAmp * 0.45);

      // Sat->ground links keep a stronger RF profile; inter-satellite uses subtle microwave offsets.
      const rfLayer = microwaveStyle
        ? microwaveWave + microwaveBeat
        : rfLayerNormalOffset(s, phase, timePhase, spatialPhase) * 0.082;
      const burst = microwaveStyle
        ? 0
        : straightBurstNormalOffset(s, packetCenter, phase, burstShape) * 0.094;
      const mixedOffset = rfLayer + burst;
      rfPoints[i]
        .copy(base)
        .addScaledVector(normal, mixedOffset)
        .addScaledVector(tangent, microwaveStyle ? microwaveWave * 0.15 : Math.abs(burst) * 0.0065);
    }
    if (microwaveStyle) {
      setLineGeometryFromPoints(signalLineRef, rfPoints, linePositionsRef.current);
    }
    if (shouldRebuildArc || linkSelected || microwaveStyle) {
      setLineGeometryFromPoints(rfLineRef, rfPoints, rfLinePositionsRef.current);
    }

    if (signalLineRef.current?.material) {
      const flicker = 0;
      const baseOpacity = !linkSelected
        ? idleOpacity
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
        lineVisible && linkSelected ? (solid || (orbitStyle && !microwaveStyle) ? 0 : rfOpacity) : 0;
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
        lineWidth={orbitStyle ? orbitLineWidth : solid ? 2.45 : signalLineWidth}
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

export function OrbitalSatellites({
  accentColor,
  reducedMotion,
  isMobile,
}: OrbitalSatellitesProps) {
  const satelliteSpecs = useMemo(() => buildUniqueSatelliteSpecs(), []);
  const satelliteLinks = useMemo(() => buildSatelliteLinkCandidates(satelliteSpecs), [satelliteSpecs]);
  const linksById = useMemo(
    () => new Map(satelliteLinks.map((link) => [link.id, link] as const)),
    [satelliteLinks],
  );
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
    () => satelliteSpecs.map(() => ({ current: new Vector3() })),
    [satelliteSpecs],
  );
  const satMeshRefs = useRef<Array<Mesh | null>>([]);
  const orbitSegmentLineRefs = useRef<Array<Array<LineLikeObject | null>>>(
    satelliteSpecs.map(() => Array.from({ length: ORBIT_SEGMENT_COUNT }, () => null)),
  );
  const motionTickLineRefs = useRef<Array<LineLikeObject | null>>([]);
  const motionTickPointsRef = useRef(
    satelliteSpecs.map(() => [new Vector3(), new Vector3()] as [Vector3, Vector3]),
  );
  const motionTickPositionsRef = useRef(
    satelliteSpecs.map(() => Array.from({ length: 2 * 3 }, () => 0)),
  );
  const activeNodeLinkKeysRef = useRef<Set<string>>(new Set());
  const activeSatIndicesRef = useRef<Set<number>>(new Set());
  const activeSatPairKeysRef = useRef<Set<string>>(new Set());
  const activePathNoiseLinkKeysRef = useRef<Set<string>>(new Set());
  const lastNodeGatewayRef = useRef<Map<string, number>>(new Map());
  const edgeStickyUntilRef = useRef<Map<string, number>>(new Map());
  const networkSolveElapsedRef = useRef(0);
  const orbitAheadSampleRef = useRef(new Vector3());
  const orbitDirectionRef = useRef(new Vector3());
  const satThetaRef = useRef<number[]>(satelliteSpecs.map(() => 0));
  const orbitTrackPoints = useMemo(() => {
    return satelliteSpecs.map((spec) => {
      const points: Vector3[] = [];
      for (let i = 0; i <= ORBIT_SEGMENT_COUNT; i += 1) {
        const theta = (i / ORBIT_SEGMENT_COUNT) * Math.PI * 2;
        points.push(orbitPoint(spec, theta, new Vector3()));
      }
      return points;
    });
  }, [satelliteSpecs]);
  const orbitTrackSegments = useMemo(
    () =>
      orbitTrackPoints.map((track) =>
        Array.from({ length: ORBIT_SEGMENT_COUNT }, (_, i) => [track[i], track[i + 1]] as const),
      ),
    [orbitTrackPoints],
  );

  useFrame(({ clock, camera }, delta) => {
    const t = clock.elapsedTime;
    const tau = Math.PI * 2;
    satelliteSpecs.forEach((spec, i) => {
      const omega = (reducedMotion ? spec.speed * 0.45 : spec.speed) * SATELLITE_SPEED_SCALE;
      const theta = t * omega * Math.PI * 2 + spec.phase;
      satThetaRef.current[i] = ((theta % tau) + tau) % tau;
      orbitPoint(spec, theta, satPositionRefs[i].current);
      const satMesh = satMeshRefs.current[i];
      if (satMesh) {
        satMesh.position.copy(satPositionRefs[i].current);
        // Keep satellite markers as screen-facing upright triangles.
        satMesh.quaternion.copy(camera.quaternion);
        const isActiveSat = activeSatIndicesRef.current.has(i);
        const pulseAmp = reducedMotion ? 0.012 : isActiveSat ? 0.085 : 0.045;
        const pulse = 1 + Math.sin(t * 2.9 + spec.phase) * pulseAmp;
        satMesh.scale.setScalar(pulse);
      }
      orbitPoint(spec, theta + 0.03, orbitAheadSampleRef.current);
      orbitDirectionRef.current
        .copy(orbitAheadSampleRef.current)
        .sub(satPositionRefs[i].current)
        .normalize();
      const tickPoints = motionTickPointsRef.current[i];
      tickPoints[0].copy(satPositionRefs[i].current).addScaledVector(orbitDirectionRef.current, 0.002);
      tickPoints[1].copy(satPositionRefs[i].current).addScaledVector(orbitDirectionRef.current, -0.012);
      setLineGeometryFromPoints(
        { current: motionTickLineRefs.current[i] },
        tickPoints,
        motionTickPositionsRef.current[i],
      );
      const tickLine = motionTickLineRefs.current[i];
      if (tickLine?.material) {
        tickLine.material.opacity = lowQualityTier ? 0.08 : 0.14;
        tickLine.material.linewidth = lowQualityTier ? 0.18 : 0.34;
      }
    });

    networkSolveElapsedRef.current += delta;
    const solveEvery = lowQualityTier ? NETWORK_SOLVE_INTERVAL_LOW_QUALITY_SEC : NETWORK_SOLVE_INTERVAL_SEC;
    if (networkSolveElapsedRef.current >= solveEvery) {
      networkSolveElapsedRef.current = 0;
      const satDegreesBackbone = Array.from({ length: satelliteSpecs.length }, () => 0);
      const sortedLinks = satelliteLinks
        .map((link) => {
          const a = satPositionRefs[link.aIndex].current;
          const b = satPositionRefs[link.bIndex].current;
          const distance = a.distanceTo(b);
          const clear = segmentClearsPlanet(a, b, PLANET_BLOCK_RADIUS);
          const score = link.baseScore + 1 / Math.max(0.001, distance);
          const stickyUntil = edgeStickyUntilRef.current.get(link.id) ?? 0;
          const currentlyActive = stickyUntil > t;
          return { link, score, clear, currentlyActive };
        })
        .sort((a, b) => b.score - a.score);

      const nextBackbone = new Set<string>();
      sortedLinks.forEach((entry) => {
        const { link, clear, score, currentlyActive } = entry;
        if (link.kind !== "backbone" || !clear) return;
        const limitA = satDegreesBackbone[link.aIndex];
        const limitB = satDegreesBackbone[link.bIndex];
        if (limitA >= BACKBONE_DEGREE_LIMIT || limitB >= BACKBONE_DEGREE_LIMIT) return;
        const meetsThreshold = score >= EDGE_PROMOTE_SCORE || (currentlyActive && score >= EDGE_DEMOTE_SCORE);
        if (!meetsThreshold) return;
        nextBackbone.add(link.id);
        satDegreesBackbone[link.aIndex] += 1;
        satDegreesBackbone[link.bIndex] += 1;
        edgeStickyUntilRef.current.set(link.id, t + EDGE_TTL_SEC);
      });

      const anchorAssignments: Array<{ key: string; satIndex: number; anchorKey: string }> = [];
      const gatewaySatIndices = new Set<number>();
      nodeAnchorEntries.forEach(([anchorKey, targetRef]) => {
        const previousGateway = lastNodeGatewayRef.current.get(anchorKey);
        const candidates = satelliteSpecs
          .map((spec, satIndex) => {
            const satPos = satPositionRefs[satIndex].current;
            const clear = segmentClearsPlanet(targetRef.current, satPos, PLANET_BLOCK_RADIUS);
            const distance = targetRef.current.distanceTo(satPos);
            const altitudeBias = Math.max(0, satPos.length() - 1);
            const stickiness = previousGateway === satIndex ? 0.12 : 0;
            const score = (clear ? 1 : 0.45) * (1 / Math.max(0.001, distance)) + altitudeBias * 0.06 + stickiness;
            return { satIndex, score };
          })
          .sort((a, b) => b.score - a.score);
        if (candidates.length === 0) return;
        const selected = candidates[0];
        gatewaySatIndices.add(selected.satIndex);
        lastNodeGatewayRef.current.set(anchorKey, selected.satIndex);
        anchorAssignments.push({
          key: `${satelliteSpecs[selected.satIndex].id}-${anchorKey}-node-link`,
          satIndex: selected.satIndex,
          anchorKey,
        });
      });

      const repairBackbone = new Set(nextBackbone);
      const degreeForRepair = [...satDegreesBackbone];
      const findBridge = (
        left: Set<number>,
        right: Set<number>,
      ): SatelliteLinkCandidate | null => {
        let bestEdge: SatelliteLinkCandidate | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        sortedLinks.forEach(({ link, clear, score }) => {
          if (!clear || link.kind !== "backbone") return;
          const splitCrosses =
            (left.has(link.aIndex) && right.has(link.bIndex)) ||
            (left.has(link.bIndex) && right.has(link.aIndex));
          if (!splitCrosses) return;
          if (
            degreeForRepair[link.aIndex] >= BACKBONE_DEGREE_LIMIT ||
            degreeForRepair[link.bIndex] >= BACKBONE_DEGREE_LIMIT
          ) {
            return;
          }
          if (score > bestScore) {
            bestScore = score;
            bestEdge = link;
          }
        });
        return bestEdge;
      };

      let repairIterations = 0;
      while (gatewaySatIndices.size > 1 && repairIterations < 6) {
        repairIterations += 1;
        const adjacency = buildSatAdjacency(repairBackbone, linksById, satelliteSpecs.length);
        const comps = satComponents(adjacency);
        const gatewayComps = comps
          .map((comp) => new Set(comp.filter((sat) => gatewaySatIndices.has(sat))))
          .filter((set) => set.size > 0);
        if (gatewayComps.length <= 1) break;
        const left = gatewayComps[0];
        const right = new Set<number>();
        for (let i = 1; i < gatewayComps.length; i += 1) {
          gatewayComps[i].forEach((v) => right.add(v));
        }
        const bridge = findBridge(left, right);
        if (!bridge) break;
        repairBackbone.add(bridge.id);
        degreeForRepair[bridge.aIndex] += 1;
        degreeForRepair[bridge.bIndex] += 1;
        edgeStickyUntilRef.current.set(bridge.id, t + EDGE_TTL_SEC);
      }

      const activeSatPairKeys = new Set<string>();
      const adjacency = buildSatAdjacency(repairBackbone, linksById, satelliteSpecs.length);
      const gatewayArray = Array.from(gatewaySatIndices);
      for (let i = 0; i < gatewayArray.length; i += 1) {
        for (let j = i + 1; j < gatewayArray.length; j += 1) {
          const pathEdges = shortestSatPathEdgeIds(
            gatewayArray[i],
            gatewayArray[j],
            adjacency,
            linksById,
            satPositionRefs,
          );
          pathEdges.forEach((edgeId) => activeSatPairKeys.add(edgeId));
        }
      }

      if (gatewayArray.length === 2 && activeSatPairKeys.size === 0) {
        const fallback = shortestSatPathEdgeIds(
          gatewayArray[0],
          gatewayArray[1],
          adjacency,
          linksById,
          satPositionRefs,
        );
        fallback.forEach((edgeId) => activeSatPairKeys.add(edgeId));
      }

      const activeSatIndices = new Set<number>();
      activeSatPairKeys.forEach((edgeId) => {
        const edge = linksById.get(edgeId);
        if (!edge) return;
        activeSatIndices.add(edge.aIndex);
        activeSatIndices.add(edge.bIndex);
      });
      anchorAssignments.forEach(({ satIndex }) => activeSatIndices.add(satIndex));
      gatewaySatIndices.forEach((idx) => activeSatIndices.add(idx));

      activeNodeLinkKeysRef.current = new Set(anchorAssignments.map((item) => item.key));
      activeSatIndicesRef.current = activeSatIndices;
      activeSatPairKeysRef.current = activeSatPairKeys;

      const adjacencyByNode = new Map<string, Set<string>>();
      const edgeEndpoints = new Map<string, [string, string]>();
      const touch = (id: string) => {
        if (!adjacencyByNode.has(id)) adjacencyByNode.set(id, new Set());
      };
      const linkNodes = (a: string, b: string, edgeKey: string) => {
        touch(a);
        touch(b);
        adjacencyByNode.get(a)?.add(b);
        adjacencyByNode.get(b)?.add(a);
        edgeEndpoints.set(edgeKey, [a, b]);
      };
      anchorAssignments.forEach(({ key, satIndex, anchorKey }) => {
        linkNodes(`g:${anchorKey}`, `s:${satIndex}`, key);
      });
      activeSatPairKeys.forEach((edgeKey) => {
        const edge = linksById.get(edgeKey);
        if (!edge) return;
        linkNodes(`s:${edge.aIndex}`, `s:${edge.bIndex}`, edgeKey);
      });
      const noisyEdgeKeys = new Set<string>();
      const visited = new Set<string>();
      adjacencyByNode.forEach((_, startNode) => {
        if (visited.has(startNode)) return;
        const stack = [startNode];
        const componentNodes: string[] = [];
        while (stack.length > 0) {
          const node = stack.pop();
          if (!node || visited.has(node)) continue;
          visited.add(node);
          componentNodes.push(node);
          adjacencyByNode.get(node)?.forEach((nextNode) => {
            if (!visited.has(nextNode)) stack.push(nextNode);
          });
        }
        const groundCount = componentNodes.reduce(
          (sum, nodeId) => sum + (nodeId.startsWith("g:") ? 1 : 0),
          0,
        );
        if (groundCount < 2) return;
        const nodeSet = new Set(componentNodes);
        edgeEndpoints.forEach(([a, b], edgeKey) => {
          if (nodeSet.has(a) && nodeSet.has(b)) noisyEdgeKeys.add(edgeKey);
        });
      });
      activePathNoiseLinkKeysRef.current = noisyEdgeKeys;
    }

    const segmentAngle = tau / ORBIT_SEGMENT_COUNT;
    orbitSegmentLineRefs.current.forEach((segmentLines, satIndex) => {
      const isActiveSat = activeSatIndicesRef.current.has(satIndex);
      const thetaNow = satThetaRef.current[satIndex] ?? 0;
      const baseOpacity = isActiveSat ? ORBIT_ACTIVE_BASE_OPACITY : ORBIT_INACTIVE_BASE_OPACITY;
      const trailGain = isActiveSat ? ORBIT_ACTIVE_TRAIL_GAIN : ORBIT_INACTIVE_TRAIL_GAIN;
      segmentLines.forEach((orbitLine, segmentIndex) => {
        if (!orbitLine?.material) return;
        const segmentCenterTheta = (segmentIndex + 0.5) * segmentAngle;
        const behindDistance = (thetaNow - segmentCenterTheta + tau) % tau;
        const trailStrength = Math.exp(-behindDistance * ORBIT_TRAIL_DECAY);
        orbitLine.material.opacity = baseOpacity + trailGain * trailStrength;
      });
    });
  });

  return (
    <group>
      {orbitTrackSegments.map((segments, satIndex) =>
        segments.map((segmentPoints, segmentIndex) => (
          <Line
            key={`${satelliteSpecs[satIndex].id}-orbit-segment-${segmentIndex}`}
            ref={(node) => {
              orbitSegmentLineRefs.current[satIndex][segmentIndex] =
                node as unknown as LineLikeObject | null;
            }}
            points={segmentPoints}
            color={signalColor}
            transparent
            opacity={ORBIT_INACTIVE_BASE_OPACITY}
            lineWidth={0.8}
            depthTest
          />
        )),
      )}

      {satelliteSpecs.map((spec, i) => (
        <mesh
          key={`${spec.id}-body`}
          ref={(node) => {
            satMeshRefs.current[i] = node;
          }}
          raycast={() => null}
        >
          <coneGeometry args={[0.0135, 0.028, 3]} />
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
      {satelliteSpecs.map((spec, i) => (
        <Line
          key={`${spec.id}-motion-tick`}
          ref={(node) => {
            motionTickLineRefs.current[i] = node as unknown as LineLikeObject | null;
          }}
          points={INITIAL_LINE_POINTS}
          color={signalColor}
          transparent
          opacity={0.14}
          lineWidth={0.34}
          depthTest
          depthWrite={false}
        />
      ))}

      {satelliteSpecs.map((spec, satIndex) =>
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
          requireFullLineVisible
            microwaveStyle
            signalOpacity={0.34}
            signalLineWidth={0.95}
            rfOpacity={0.58}
            rfLineWidth={0.95}
            linkKey={`${spec.id}-${anchorKey}-node-link`}
            activeLinkKeysRef={activeNodeLinkKeysRef}
            activeNoiseLinkKeysRef={activePathNoiseLinkKeysRef}
            idleOpacity={0}
            idleLineWidth={0}
            lowQuality={lowQualityTier}
          />
        )),
      )}

      {satelliteLinks.map((pair) => (
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
          microwaveStyle
          orbitLineWidth={1.35}
          signalOpacity={0.58}
          rfOpacity={0.85}
          linkKey={pair.id}
          activeLinkKeysRef={activeSatPairKeysRef}
          activeNoiseLinkKeysRef={activePathNoiseLinkKeysRef}
          idleOpacity={0}
          idleLineWidth={0}
          lowQuality={lowQualityTier}
        />
      ))}
    </group>
  );
}
