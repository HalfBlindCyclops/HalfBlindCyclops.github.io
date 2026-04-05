"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, Mesh, Quaternion, Vector3 } from "three";
import { useCursor } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { resumeNodes, type ResumeNode } from "@/data/resumeNodes";
import { latLonToVector3 } from "@/lib/geo";

type GlobeNodesProps = {
  activeNodeId: string | null;
  reducedMotion: boolean;
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
        opacity={0.82}
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
  onClick,
  onHoverIntent,
}: {
  node: ResumeNode;
  isActive: boolean;
  reducedMotion: boolean;
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
  const baseColor = useMemo(() => new Color(node.color), [node.color]);
  const pulseColor = useMemo(() => new Color(node.color).multiplyScalar(1.7), [node.color]);
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
          <ActiveConnectionRing ringColor={pulseColor} reducedMotion={reducedMotion} />
        ) : null}
        <group
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
        {isMapPin ? (
          <>
            <mesh position={[0, 0.017, 0]}>
              <cylinderGeometry args={[0.0038, 0.0038, 0.032, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.55} roughness={0.32} />
            </mesh>
            <mesh position={[0, 0.046, 0]}>
              <cylinderGeometry args={[0.018, 0.0055, 0.026, 12]} />
              <meshStandardMaterial
                color={baseColor}
                emissive={pulseColor}
                emissiveIntensity={isActive || hovered ? 2.4 : 1.1}
                metalness={0.2}
                roughness={0.45}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 0.074, 0]}>
              <sphereGeometry args={[pinHeadR, 20, 20]} />
              <meshStandardMaterial
                emissive={pulseColor}
                emissiveIntensity={isActive || hovered ? 4.2 : 2.0}
                color={baseColor}
                metalness={0.15}
                roughness={0.35}
                toneMapped={false}
              />
            </mesh>
          </>
        ) : isOrbital ? (
          <>
            <mesh position={[0, 0.026, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 0.05, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.056, 0]}>
              <sphereGeometry args={[isActive ? 0.022 : 0.018, 16, 16]} />
              <meshStandardMaterial
                emissive={pulseColor}
                emissiveIntensity={isActive || hovered ? 4.6 : 2.2}
                color={baseColor}
                toneMapped={false}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.042, 0]}>
              <torusGeometry args={[0.032, 0.0035, 8, 28]} />
              <meshBasicMaterial
                color={pulseColor}
                transparent
                opacity={isActive || hovered ? 0.8 : 0.5}
                toneMapped={false}
              />
            </mesh>
          </>
        ) : (
          <group scale={isActive || hovered ? 1.42 : 1.32}>
            <mesh position={[0, 0.0036, 0]}>
              <cylinderGeometry args={[0.033, 0.034, 0.0072, 36]} />
              <meshStandardMaterial
                color="#0f172a"
                metalness={0.68}
                roughness={0.36}
                envMapIntensity={0.9}
              />
            </mesh>
            <mesh position={[0, 0.004, 0]}>
              <boxGeometry args={[0.048, 0.0011, 0.002]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.5} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.004, 0]}>
              <boxGeometry args={[0.002, 0.0011, 0.048]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.5} roughness={0.45} />
            </mesh>
            <mesh ref={uplinkRimRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0078, 0]}>
              <torusGeometry args={[0.035, 0.0022, 10, 40]} />
              <meshBasicMaterial
                color={pulseColor}
                transparent
                opacity={isActive || hovered ? 0.9 : 0.58}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 0.014, 0]}>
              <cylinderGeometry args={[0.0036, 0.0032, 0.016, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.52} roughness={0.34} />
            </mesh>
            <mesh position={[0, 0.0245, 0]}>
              <sphereGeometry args={[isActive || hovered ? 0.0094 : 0.0078, 16, 16]} />
              <meshStandardMaterial
                color={baseColor}
                emissive={pulseColor}
                emissiveIntensity={isActive || hovered ? 5.2 : 2.85}
                metalness={0.22}
                roughness={0.32}
                toneMapped={false}
              />
            </mesh>
          </group>
        )}
        </group>
      </group>
    </group>
  );
}

export function GlobeNodes({ activeNodeId, reducedMotion, onSelect }: GlobeNodesProps) {
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
          onClick={() => onSelect(node)}
          onHoverIntent={onHoverIntent}
        />
      ))}
    </group>
  );
}
