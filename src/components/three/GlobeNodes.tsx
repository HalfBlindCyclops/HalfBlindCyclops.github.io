"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, Mesh, Quaternion, Vector3 } from "three";
import { useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { resumeNodes, type ResumeNode } from "@/data/resumeNodes";
import { latLonToVector3 } from "@/lib/geo";

/** Push accent toward connector-line brightness; meshBasic + no tone map keeps parity with 2D signal UI. */
function vividAccentForPin(c: Color, emphasis: boolean): Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const sMul = emphasis ? 1.28 : 1.18;
  const lMul = emphasis ? 1.14 : 1.08;
  const out = new Color();
  out.setHSL(hsl.h, Math.min(1, hsl.s * sMul), Math.min(0.985, hsl.l * lMul));
  return out;
}

/** Metal stalk: cool depth that still reads as part of the accent stack (not flat grey). */
function stemColorFromAccent(base: Color): Color {
  return base.clone().multiplyScalar(0.42).lerp(new Color(0x0f172a), 0.38);
}

type GlobeNodesProps = {
  activeNodeId: string | null;
  reducedMotion: boolean;
  accentColor?: string;
  onSelect: (node: ResumeNode) => void;
};

/** Flat ring on the globe surface around the active pin (connector target). */
function ActiveConnectionRing({
  ringColor,
  reducedMotion,
}: {
  ringColor: Color;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || reducedMotion) return;
    const s = 1 + Math.sin(clock.elapsedTime * 2.35) * 0.055;
    mesh.scale.setScalar(s);
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0.0015, 0]}
      raycast={() => null}
      renderOrder={2}
    >
      <torusGeometry args={[0.048, 0.0028, 10, 44]} />
      <meshBasicMaterial
        color={ringColor}
        transparent
        opacity={0.98}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
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
          <ActiveConnectionRing
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

export function GlobeNodes({
  activeNodeId,
  reducedMotion,
  accentColor,
  onSelect,
}: GlobeNodesProps) {
  const hoverRafRef = useRef<number | null>(null);
  const [globePointer, setGlobePointer] = useState(false);

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
    </group>
  );
}
