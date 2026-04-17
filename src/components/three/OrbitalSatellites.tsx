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
};

type SatelliteSpec = {
  id: string;
  targetNodeId: "about" | "experience" | "projects";
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
    targetNodeId: "about",
    radius: 1.46,
    speed: 0.03,
    phase: 0.25,
    inclinationDeg: 26,
    yawDeg: 12,
    eccentricity: 0.14,
    argumentOfPerigeeDeg: 38,
  },
  {
    id: "sat-experience",
    targetNodeId: "experience",
    // Molniya-like: high inclination + eccentric ellipse.
    radius: 2.05, // Semi-major axis proxy (scene units)
    speed: 0.012,
    phase: 2.1,
    inclinationDeg: 63.4,
    yawDeg: -40,
    eccentricity: 0.45,
    argumentOfPerigeeDeg: 270,
  },
  {
    id: "sat-projects",
    targetNodeId: "projects",
    radius: 1.72,
    speed: 0.018,
    phase: 4.05,
    inclinationDeg: 34,
    yawDeg: 78,
    eccentricity: 0.1,
    argumentOfPerigeeDeg: 214,
  },
];

const SATELLITE_PAIRS: SatellitePair[] = [
  { id: "sat-link-ae", aIndex: 0, bIndex: 1, phase: 0.2 },
  { id: "sat-link-ep", aIndex: 1, bIndex: 2, phase: 1.1 },
  { id: "sat-link-pa", aIndex: 2, bIndex: 0, phase: 2.4 },
];

const UP_AXIS = new Vector3(0, 1, 0);
const ALT_AXIS = new Vector3(1, 0, 0);
const SIGNAL_ARC_SEGMENTS = 24;
const SIGNAL_ARC_LIFT = 0.16;
const SIGNAL_CLEARANCE_RADIUS = 1.08;
const SATELLITE_SPEED_SCALE = 1 / 3;

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
  out.applyAxisAngle(new Vector3(1, 0, 0), (spec.inclinationDeg * Math.PI) / 180);
  out.applyAxisAngle(new Vector3(0, 1, 0), (spec.yawDeg * Math.PI) / 180);
  return out;
}

function buildSignalArcPoints(
  start: Vector3,
  end: Vector3,
  points: Vector3[],
  startDir: Vector3,
  endDir: Vector3,
  dirOut: Vector3,
) {
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

function SignalLine({
  startRef,
  endRef,
  phase,
  signalColor,
  reducedMotion,
  alwaysVisible = false,
  emphasize = false,
  showWaveWhenReduced = false,
}: {
  startRef: MutableRefObject<Vector3>;
  endRef: MutableRefObject<Vector3>;
  phase: number;
  signalColor: Color;
  reducedMotion: boolean;
  alwaysVisible?: boolean;
  emphasize?: boolean;
  showWaveWhenReduced?: boolean;
}) {
  const signalLineRef = useRef<any>(null);
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
  const signalGroupRef = useRef<any>(null);
  const worldStartRef = useRef(new Vector3());
  const worldEndRef = useRef(new Vector3());
  const worldMidRef = useRef(new Vector3());
  const tangentFromRef = useRef(new Vector3());
  const tangentToRef = useRef(new Vector3());
  const camDirRef = useRef(new Vector3());
  const midRef = useRef(new Vector3());

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    startTmpRef.current.copy(startRef.current);
    endTmpRef.current.copy(endRef.current);
    buildSignalArcPoints(
      startTmpRef.current,
      endTmpRef.current,
      arcPointsRef.current,
      startDirRef.current,
      endDirRef.current,
      arcDirRef.current,
    );
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
    const lineVisible = alwaysVisible || Math.max(startFacing, endFacing, midFacing) > -0.06;

    if (signalLineRef.current?.geometry) {
      signalLineRef.current.geometry.setFromPoints(arcPointsRef.current);
    }
    if (signalLineRef.current?.material) {
      const flicker = reducedMotion ? 0 : Math.sin(t * 5.2 + phase) * 0.09;
      const baseOpacity = emphasize ? 0.72 : 0.48;
      signalLineRef.current.material.opacity = lineVisible ? baseOpacity + flicker : 0;
    }

    if (pulseRef.current) {
      const pulseSpeed = reducedMotion ? (showWaveWhenReduced ? 0.038 : 0.025) : 0.065;
      const pulseT = (t * pulseSpeed + phase * 0.13) % 1;
      pointOnArc(arcPointsRef.current, pulseT, pointTmpRef.current);
      pulseRef.current.position.copy(pointTmpRef.current);
      pulseRef.current.visible = lineVisible;
    }

    const showWave = lineVisible && (!reducedMotion || showWaveWhenReduced);
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
    <group ref={signalGroupRef}>
      <Line
        ref={signalLineRef}
        points={[startRef.current, endRef.current]}
        color={signalColor}
        transparent
        opacity={0.48}
        lineWidth={emphasize ? 1.35 : 1.1}
        depthTest={false}
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

export function OrbitalSatellites({ accentColor, reducedMotion }: OrbitalSatellitesProps) {
  const accent = useMemo(() => new Color().setStyle(accentColor), [accentColor]);
  const signalColor = useMemo(
    () => accent.clone().lerp(new Color("white"), 0.14),
    [accent],
  );

  const nodeAnchors = useMemo(() => {
    const map = new Map<string, MutableRefObject<Vector3>>();
    for (const node of resumeNodes) {
      if (
        node.id !== "about" &&
        node.id !== "experience" &&
        node.id !== "projects"
      ) {
        continue;
      }
      map.set(node.id, { current: latLonToVector3(node.latitude, node.longitude, 1.11) });
    }
    return map;
  }, []);
  const satPositionRefs = useMemo(
    () => SATELLITE_SPECS.map(() => ({ current: new Vector3() })),
    [],
  );
  const satMeshRefs = useRef<Array<Mesh | null>>([]);
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
  });

  return (
    <group>
      {orbitTrackPoints.map((track, i) => (
        <Line
          key={`${SATELLITE_SPECS[i].id}-orbit`}
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

      {SATELLITE_SPECS.map((spec, i) => {
        const targetRef = nodeAnchors.get(spec.targetNodeId);
        if (!targetRef) return null;
        return (
          <SignalLine
            key={`${spec.id}-node-link`}
            startRef={targetRef}
            endRef={satPositionRefs[i]}
            phase={spec.phase}
            signalColor={signalColor}
            reducedMotion={reducedMotion}
          />
        );
      })}

      {SATELLITE_PAIRS.map((pair) => (
        <SignalLine
          key={pair.id}
          startRef={satPositionRefs[pair.aIndex]}
          endRef={satPositionRefs[pair.bIndex]}
          phase={pair.phase}
          signalColor={signalColor}
          reducedMotion={reducedMotion}
          alwaysVisible
          emphasize
          showWaveWhenReduced
        />
      ))}
    </group>
  );
}
