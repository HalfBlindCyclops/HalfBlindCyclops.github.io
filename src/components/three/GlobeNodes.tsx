"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, Mesh, QuadraticBezierCurve3, Quaternion, Vector3 } from "three";
import { Line, useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type { Line2 } from "three-stdlib";
import { experienceMiniNodes } from "@/data/experienceMiniNodes";
import { projectMiniNodes } from "@/data/projectMiniNodes";
import { resumeNodes, type ResumeNode } from "@/data/resumeNodes";
import { latLonToVector3 } from "@/lib/geo";

/** Slight chroma lift for pins; cap lightness so active rings stay blue, not blown-out white. */
function vividAccentForPin(c: Color, emphasis: boolean): Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const sMul = emphasis ? 1.1 : 1.05;
  const lMul = emphasis ? 1.05 : 1.02;
  const lCap = emphasis ? 0.76 : 0.72;
  const out = new Color();
  out.setHSL(hsl.h, Math.min(1, hsl.s * sMul), Math.min(lCap, hsl.l * lMul));
  return out;
}

/** Metal stalk: cool depth that still reads as part of the accent stack (not flat grey). */
function stemColorFromAccent(base: Color): Color {
  return base.clone().multiplyScalar(0.42).lerp(new Color(0x0f172a), 0.38);
}

type GlobeNodesProps = {
  activeNodeId: string | null;
  activeProjectMiniNodeId: string | null;
  activeExperienceMiniNodeId: string | null;
  showProjectMiniNodes: boolean;
  showExperienceMiniNodes: boolean;
  reducedMotion: boolean;
  accentColor?: string;
  onSelect: (node: ResumeNode) => void;
  onSelectProjectMiniNode: (miniNodeId: string) => void;
  onSelectExperienceMiniNode: (miniNodeId: string) => void;
};

type ActiveRingSpec = {
  radius: number;
  tube: number;
  phase: number;
  opacity: number;
  amp: number;
};

/** Nested tori on the surface; smaller inward, staggered pulse phases for a ripple. */
const ACTIVE_CONNECTION_RINGS: ActiveRingSpec[] = [
  { radius: 0.056, tube: 0.0027, phase: 0, opacity: 0.9, amp: 0.062 },
  { radius: 0.042, tube: 0.0024, phase: 1.25, opacity: 0.76, amp: 0.07 },
  { radius: 0.03, tube: 0.0021, phase: 2.5, opacity: 0.62, amp: 0.078 },
  { radius: 0.019, tube: 0.00175, phase: 3.75, opacity: 0.5, amp: 0.085 },
];

function ActiveConnectionRingBand({
  ringColor,
  reducedMotion,
  spec,
  index,
}: {
  ringColor: Color;
  reducedMotion: boolean;
  spec: ActiveRingSpec;
  index: number;
}) {
  const meshRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (reducedMotion) {
      mesh.scale.setScalar(1);
      return;
    }
    const t = clock.elapsedTime * 2.32;
    const s = 1 + Math.sin(t + spec.phase) * spec.amp;
    mesh.scale.setScalar(s);
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0.0015 + index * 0.00035, 0]}
      raycast={() => null}
      renderOrder={2 + index}
    >
      <torusGeometry args={[spec.radius, spec.tube, 10, 44]} />
      <meshBasicMaterial
        color={ringColor}
        transparent
        opacity={spec.opacity}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function ActiveConnectionRings({
  ringColor,
  reducedMotion,
}: {
  ringColor: Color;
  reducedMotion: boolean;
}) {
  return (
    <>
      {ACTIVE_CONNECTION_RINGS.map((spec, i) => (
        <ActiveConnectionRingBand
          key={i}
          ringColor={ringColor}
          reducedMotion={reducedMotion}
          spec={spec}
          index={i}
        />
      ))}
    </>
  );
}

function NodeMarker({
  node,
  isActive,
  reducedMotion,
  accentColor,
  onClick,
  onHoverIntent,
}: {
  node: ResumeNode;
  isActive: boolean;
  reducedMotion: boolean;
  accentColor?: string;
  onClick: () => void;
  onHoverIntent: (id: string | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const point = useMemo(
    () => latLonToVector3(node.latitude, node.longitude, 1.03),
    [node.latitude, node.longitude],
  );
  const effectiveColor = accentColor ?? node.color;
  const baseColor = useMemo(() => new Color().setStyle(effectiveColor), [effectiveColor]);
  const pinBodyColor = useMemo(
    () => vividAccentForPin(baseColor, isActive || hovered),
    [baseColor, isActive, hovered],
  );
  const stemColor = useMemo(() => stemColorFromAccent(baseColor), [baseColor]);
  const uplinkPadBase = useMemo(
    () => new Color(0x1e3a5f).lerp(baseColor, 0.26),
    [baseColor],
  );
  const uplinkRimRef = useRef<Mesh>(null);
  const outward = useMemo(() => point.clone().normalize(), [point]);
  const antennaQuat = useMemo(() => {
    const up = new Vector3(0, 1, 0);
    return new Quaternion().setFromUnitVectors(up, outward);
  }, [outward]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    draggingRef.current = false;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!pointerStartRef.current) return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    if (dx * dx + dy * dy > 25) {
      draggingRef.current = true;
    }
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const wasDragging = draggingRef.current;
    pointerStartRef.current = null;
    draggingRef.current = false;
    if (!wasDragging) {
      onClick();
    }
  };

  useEffect(() => {
    if (hovered) {
      onHoverIntent(node.id);
    }
    return () => {
      onHoverIntent(null);
    };
  }, [hovered, node.id, onHoverIntent]);

  useFrame(({ clock }) => {
    const rimPulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 2.85) * 0.07;
    const hoverScale = isActive || hovered ? 1.1 : 1;
    if (uplinkRimRef.current) {
      uplinkRimRef.current.scale.setScalar(rimPulse * hoverScale);
    }
  });

  const isMapPin = node.markerStyle === "mapPin";
  const isOrbital = node.markerStyle === "orbital";
  const pinHeadR = isActive || hovered ? 0.0175 : 0.015;

  return (
    <group>
      <group position={point} quaternion={antennaQuat}>
        {isActive ? (
          <ActiveConnectionRings
            ringColor={vividAccentForPin(baseColor, true)}
            reducedMotion={reducedMotion}
          />
        ) : null}
        <group
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
        {/* Larger invisible hit area so node selection is easy from oblique angles. */}
        <mesh position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.045, 14, 14]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {isMapPin ? (
          <>
            <mesh position={[0, 0.017, 0]}>
              <cylinderGeometry args={[0.0038, 0.0038, 0.032, 10]} />
              <meshStandardMaterial
                color={stemColor}
                metalness={0.5}
                roughness={0.28}
                emissive={pinBodyColor}
                emissiveIntensity={0.08}
              />
            </mesh>
            <mesh position={[0, 0.046, 0]}>
              <cylinderGeometry args={[0.018, 0.0055, 0.026, 12]} />
              <meshBasicMaterial color={pinBodyColor} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.074, 0]}>
              <sphereGeometry args={[pinHeadR, 20, 20]} />
              <meshBasicMaterial color={pinBodyColor} toneMapped={false} />
            </mesh>
          </>
        ) : isOrbital ? (
          <>
            <mesh position={[0, 0.026, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 0.05, 10]} />
              <meshStandardMaterial
                color={stemColor}
                metalness={0.38}
                roughness={0.36}
                emissive={pinBodyColor}
                emissiveIntensity={0.07}
              />
            </mesh>
            <mesh position={[0, 0.056, 0]}>
              <sphereGeometry args={[isActive ? 0.022 : 0.018, 16, 16]} />
              <meshBasicMaterial color={pinBodyColor} toneMapped={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.042, 0]}>
              <torusGeometry args={[0.032, 0.0035, 8, 28]} />
              <meshBasicMaterial
                color={vividAccentForPin(baseColor, isActive || hovered)}
                transparent
                opacity={isActive || hovered ? 0.92 : 0.72}
                toneMapped={false}
              />
            </mesh>
          </>
        ) : (
          <group scale={isActive || hovered ? 1.42 : 1.32}>
            <mesh position={[0, 0.004, 0]}>
              <boxGeometry args={[0.048, 0.0011, 0.002]} />
              <meshStandardMaterial color={uplinkPadBase} metalness={0.5} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.004, 0]}>
              <boxGeometry args={[0.002, 0.0011, 0.048]} />
              <meshStandardMaterial color={uplinkPadBase} metalness={0.5} roughness={0.45} />
            </mesh>
            <mesh ref={uplinkRimRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0078, 0]}>
              <torusGeometry args={[0.029, 0.0018, 10, 40]} />
              <meshBasicMaterial
                color={vividAccentForPin(baseColor, isActive || hovered)}
                transparent
                opacity={isActive || hovered ? 0.96 : 0.78}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 0.014, 0]}>
              <cylinderGeometry args={[0.0036, 0.0032, 0.016, 10]} />
              <meshStandardMaterial
                color={stemColor}
                metalness={0.48}
                roughness={0.3}
                emissive={pinBodyColor}
                emissiveIntensity={0.08}
              />
            </mesh>
            <mesh position={[0, 0.0245, 0]}>
              <sphereGeometry args={[isActive || hovered ? 0.0094 : 0.0078, 16, 16]} />
              <meshBasicMaterial color={pinBodyColor} toneMapped={false} />
            </mesh>
          </group>
        )}
        </group>
      </group>
    </group>
  );
}

function MiniNodeMarker({
  id,
  latitude,
  longitude,
  isActive,
  accentColor,
  reducedMotion,
  onClick,
  onHoverIntent,
}: {
  id: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  accentColor: Color;
  reducedMotion: boolean;
  onClick: () => void;
  onHoverIntent: (id: string | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const point = useMemo(() => latLonToVector3(latitude, longitude, 1.02), [latitude, longitude]);
  const normal = useMemo(() => point.clone().normalize(), [point]);
  const markerPos = useMemo(() => point.clone().addScaledVector(normal, 0.0135), [normal, point]);
  const ringRef = useRef<Mesh>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const activeOrHovered = isActive || hovered;

  useEffect(() => {
    if (hovered) {
      onHoverIntent(id);
    }
    return () => {
      onHoverIntent(null);
    };
  }, [hovered, id, onHoverIntent]);

  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (!ring) return;
    if (reducedMotion) {
      ring.scale.setScalar(activeOrHovered ? 1.08 : 1);
      return;
    }
    const pulse = 1 + Math.sin(clock.elapsedTime * 2.8) * 0.08;
    ring.scale.setScalar(pulse * (activeOrHovered ? 1.1 : 1));
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    draggingRef.current = false;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!pointerStartRef.current) return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    if (dx * dx + dy * dy > 25) draggingRef.current = true;
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const wasDragging = draggingRef.current;
    pointerStartRef.current = null;
    draggingRef.current = false;
    if (!wasDragging) onClick();
  };

  return (
    <group position={markerPos}>
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <sphereGeometry args={[0.026, 14, 14]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[activeOrHovered ? 0.0085 : 0.007, 14, 14]} />
        <meshBasicMaterial
          color={vividAccentForPin(accentColor, activeOrHovered)}
          toneMapped={false}
          transparent
          opacity={activeOrHovered ? 1 : 0.88}
        />
      </mesh>
      <mesh
        ref={ringRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        raycast={() => null}
      >
        <torusGeometry args={[0.012, 0.0012, 10, 32]} />
        <meshBasicMaterial
          color={vividAccentForPin(accentColor, activeOrHovered)}
          transparent
          opacity={activeOrHovered ? 0.92 : 0.72}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function MiniNodeSignalLink({
  fromLatitude,
  fromLongitude,
  toLatitude,
  toLongitude,
  accentColor,
  reducedMotion,
  isActive,
}: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  accentColor: Color;
  reducedMotion: boolean;
  isActive: boolean;
}) {
  const ACTIVE_WAVE_DOT_COUNT = 7;
  const lineRef = useRef<Line2 | null>(null);
  const pulseARef = useRef<Mesh>(null);
  const pulseBRef = useRef<Mesh>(null);
  const receiverRingRef = useRef<Mesh>(null);
  const receiverCoreRef = useRef<Mesh>(null);
  const waveDotsRef = useRef<Array<Mesh | null>>([]);
  const pulseColor = useMemo(
    () =>
      vividAccentForPin(accentColor, isActive)
        .clone()
        .lerp(new Color("white"), isActive ? 0.34 : 0.08),
    [accentColor, isActive],
  );
  const receiverBasePoint = useMemo(
    () => latLonToVector3(toLatitude, toLongitude, 1.0645),
    [toLatitude, toLongitude],
  );
  const receiverNormal = useMemo(() => receiverBasePoint.clone().normalize(), [receiverBasePoint]);
  const receiverQuat = useMemo(() => {
    const up = new Vector3(0, 1, 0);
    return new Quaternion().setFromUnitVectors(up, receiverNormal);
  }, [receiverNormal]);
  const signalPhase = useMemo(
    () => (Math.abs(fromLatitude * 13.7 + fromLongitude * 7.9) % 360) * (Math.PI / 180),
    [fromLatitude, fromLongitude],
  );
  const path = useMemo(() => {
    const start = latLonToVector3(fromLatitude, fromLongitude, 1.036);
    const end = latLonToVector3(toLatitude, toLongitude, 1.062);
    const control = start
      .clone()
      .add(end)
      .multiplyScalar(0.5)
      .normalize()
      .multiplyScalar(1.14);
    return new QuadraticBezierCurve3(start, control, end);
  }, [fromLatitude, fromLongitude, toLatitude, toLongitude]);
  const pathPoints = useMemo(() => path.getPoints(48), [path]);
  const tempPointA = useRef(new Vector3());
  const tempPointB = useRef(new Vector3());
  const tempWavePoint = useRef(new Vector3());
  const tempWaveTangent = useRef(new Vector3());
  const tempWaveNormal = useRef(new Vector3());
  const camDirRef = useRef(new Vector3());
  const upAxis = useMemo(() => new Vector3(0, 1, 0), []);
  const altAxis = useMemo(() => new Vector3(1, 0, 0), []);
  const lineBaseOpacity = isActive ? 0.92 : 0.34;

  useFrame(({ clock, camera }) => {
    const speed = reducedMotion ? 0.1 : 0.22;
    const head = (clock.elapsedTime * speed) % 1;
    const tail = (head + 0.45) % 1;
    const receivePulse = reducedMotion
      ? 1
      : 1 + Math.sin(clock.elapsedTime * 3.3 + signalPhase) * 0.16;
    camDirRef.current.copy(camera.position).normalize();
    let visibleSamples = 0;
    for (let i = 0; i < pathPoints.length; i += 1) {
      if (pathPoints[i].dot(camDirRef.current) > 0) visibleSamples += 1;
    }
    const lineVisibility = visibleSamples / Math.max(1, pathPoints.length);

    path.getPoint(head, tempPointA.current);
    path.getPoint(tail, tempPointB.current);
    const pulseAVisible = tempPointA.current.dot(camDirRef.current) > 0;
    const pulseBVisible = tempPointB.current.dot(camDirRef.current) > 0;
    const receiverVisible = receiverBasePoint.dot(camDirRef.current) > 0;

    if (lineRef.current?.material) {
      const activeVisibility = isActive ? Math.max(0.72, lineVisibility) : lineVisibility;
      (lineRef.current.material as { opacity: number }).opacity = lineBaseOpacity * activeVisibility;
    }

    if (pulseARef.current) {
      pulseARef.current.position.copy(tempPointA.current);
      const s = isActive ? 1.2 : 1;
      pulseARef.current.scale.setScalar(s);
      pulseARef.current.visible = pulseAVisible;
    }
    if (pulseBRef.current) {
      pulseBRef.current.position.copy(tempPointB.current);
      const s = isActive ? 1.05 : 0.9;
      pulseBRef.current.scale.setScalar(s);
      pulseBRef.current.visible = pulseBVisible;
    }
    if (receiverRingRef.current) {
      receiverRingRef.current.scale.setScalar((isActive ? 1.06 : 1) * receivePulse);
      receiverRingRef.current.visible = receiverVisible;
    }
    if (receiverCoreRef.current) {
      receiverCoreRef.current.scale.setScalar((isActive ? 1.12 : 1) * (0.96 + (receivePulse - 1) * 0.65));
      receiverCoreRef.current.visible = receiverVisible;
    }

    if (isActive && !reducedMotion) {
      for (let i = 0; i < ACTIVE_WAVE_DOT_COUNT; i += 1) {
        const dot = waveDotsRef.current[i];
        if (!dot) continue;
        const progress = (i / ACTIVE_WAVE_DOT_COUNT + clock.elapsedTime * 0.22) % 1;
        path.getPoint(progress, tempWavePoint.current);
        path.getTangent(progress, tempWaveTangent.current);
        tempWaveNormal.current.crossVectors(tempWaveTangent.current, upAxis);
        if (tempWaveNormal.current.lengthSq() < 1e-5) {
          tempWaveNormal.current.crossVectors(tempWaveTangent.current, altAxis);
        }
        tempWaveNormal.current.normalize();
        const wavePhase = progress * Math.PI * 9 - clock.elapsedTime * 6.2 + signalPhase;
        const waveOffset = Math.sin(wavePhase) * 0.0085;
        dot.position.copy(tempWavePoint.current).addScaledVector(tempWaveNormal.current, waveOffset);
        const sizePulse = 0.9 + Math.sin(wavePhase + Math.PI / 2) * 0.1;
        dot.scale.setScalar(sizePulse);
        dot.visible = tempWavePoint.current.dot(camDirRef.current) > 0;
      }
    } else {
      waveDotsRef.current.forEach((dot) => {
        if (!dot) return;
        dot.visible = false;
      });
    }
  });

  return (
    <group>
      {isActive ? (
        <Line
          points={pathPoints}
          color={pulseColor}
          transparent
          opacity={0.3}
          lineWidth={3.8}
          depthWrite={false}
        />
      ) : null}
      <Line
        ref={lineRef}
        points={pathPoints}
        color={pulseColor}
        transparent
        opacity={lineBaseOpacity}
        lineWidth={isActive ? 2.45 : 0.95}
        depthWrite={false}
      />
      <mesh ref={pulseARef} raycast={() => null}>
        <sphereGeometry args={[0.0054, 12, 12]} />
        <meshBasicMaterial
          color={pulseColor}
          toneMapped={false}
          transparent
          opacity={isActive ? 0.95 : 0.82}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={pulseBRef} raycast={() => null}>
        <sphereGeometry args={[0.0042, 10, 10]} />
        <meshBasicMaterial
          color={pulseColor}
          toneMapped={false}
          transparent
          opacity={isActive ? 0.86 : 0.7}
          depthWrite={false}
        />
      </mesh>
      <group position={receiverBasePoint} quaternion={receiverQuat} raycast={() => null}>
        <mesh ref={receiverRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.016, 0.0016, 10, 40]} />
          <meshBasicMaterial
            color={pulseColor}
            toneMapped={false}
            transparent
            opacity={isActive ? 0.7 : 0.38}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={receiverCoreRef} position={[0, 0.0014, 0]}>
          <sphereGeometry args={[0.0052, 12, 12]} />
          <meshBasicMaterial
            color={pulseColor}
            toneMapped={false}
            transparent
            opacity={isActive ? 0.92 : 0.62}
            depthWrite={false}
          />
        </mesh>
      </group>
      {Array.from({ length: ACTIVE_WAVE_DOT_COUNT }).map((_, i) => (
        <mesh
          key={`wave-dot-${i}`}
          ref={(node) => {
            waveDotsRef.current[i] = node;
          }}
          visible={false}
          raycast={() => null}
        >
          <sphereGeometry args={[0.0033, 10, 10]} />
          <meshBasicMaterial
            color={pulseColor}
            toneMapped={false}
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function GlobeNodes({
  activeNodeId,
  activeProjectMiniNodeId,
  activeExperienceMiniNodeId,
  showProjectMiniNodes,
  showExperienceMiniNodes,
  reducedMotion,
  accentColor,
  onSelect,
  onSelectProjectMiniNode,
  onSelectExperienceMiniNode,
}: GlobeNodesProps) {
  const hoverRafRef = useRef<number | null>(null);
  const [globePointer, setGlobePointer] = useState(false);
  const miniAccent = useMemo(
    () => new Color().setStyle(accentColor ?? "#2dd4bf"),
    [accentColor],
  );
  const projectsNode = useMemo(() => resumeNodes.find((node) => node.id === "projects") ?? null, []);
  const experienceNode = useMemo(() => resumeNodes.find((node) => node.id === "experience") ?? null, []);

  const onHoverIntent = useCallback((id: string | null) => {
    if (hoverRafRef.current !== null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    if (id) {
      setGlobePointer(true);
      return;
    }
    hoverRafRef.current = requestAnimationFrame(() => {
      setGlobePointer(false);
      hoverRafRef.current = null;
    });
  }, []);

  useCursor(globePointer);

  useEffect(
    () => () => {
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current);
    },
    [],
  );

  return (
    <group renderOrder={1}>
      {resumeNodes.map((node) => (
        <NodeMarker
          key={node.id}
          node={node}
          isActive={activeNodeId === node.id}
          reducedMotion={reducedMotion}
          accentColor={accentColor}
          onClick={() => onSelect(node)}
          onHoverIntent={onHoverIntent}
        />
      ))}
      {showProjectMiniNodes
        ? projectMiniNodes.map((miniNode) => (
            <MiniNodeMarker
              key={miniNode.id}
              id={miniNode.id}
              latitude={miniNode.latitude}
              longitude={miniNode.longitude}
              isActive={activeProjectMiniNodeId === miniNode.id}
              accentColor={miniAccent}
              reducedMotion={reducedMotion}
              onClick={() => onSelectProjectMiniNode(miniNode.id)}
              onHoverIntent={onHoverIntent}
            />
          ))
        : null}
      {showProjectMiniNodes && projectsNode
        ? projectMiniNodes.map((miniNode) => (
            <MiniNodeSignalLink
              key={`${miniNode.id}-link`}
              fromLatitude={miniNode.latitude}
              fromLongitude={miniNode.longitude}
              toLatitude={projectsNode.latitude}
              toLongitude={projectsNode.longitude}
              accentColor={miniAccent}
              reducedMotion={reducedMotion}
              isActive={activeProjectMiniNodeId === miniNode.id}
            />
          ))
        : null}
      {showExperienceMiniNodes
        ? experienceMiniNodes.map((miniNode) => (
            <MiniNodeMarker
              key={miniNode.id}
              id={miniNode.id}
              latitude={miniNode.latitude}
              longitude={miniNode.longitude}
              isActive={activeExperienceMiniNodeId === miniNode.id}
              accentColor={miniAccent}
              reducedMotion={reducedMotion}
              onClick={() => onSelectExperienceMiniNode(miniNode.id)}
              onHoverIntent={onHoverIntent}
            />
          ))
        : null}
      {showExperienceMiniNodes && experienceNode
        ? experienceMiniNodes.map((miniNode) => (
            <MiniNodeSignalLink
              key={`${miniNode.id}-link`}
              fromLatitude={miniNode.latitude}
              fromLongitude={miniNode.longitude}
              toLatitude={experienceNode.latitude}
              toLongitude={experienceNode.longitude}
              accentColor={miniAccent}
              reducedMotion={reducedMotion}
              isActive={activeExperienceMiniNodeId === miniNode.id}
            />
          ))
        : null}
    </group>
  );
}
