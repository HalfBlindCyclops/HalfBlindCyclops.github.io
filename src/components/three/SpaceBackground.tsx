"use client";

import { Suspense, useLayoutEffect } from "react";
import { ACESFilmicToneMapping, Color, SRGBColorSpace } from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Stars } from "@react-three/drei";

/** Opaque black vs transparent clear so a behind layer (shared starfield) can show through. */
function SceneClearTone({ opaque }: { opaque: boolean }) {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    if (opaque) {
      scene.background = new Color("#000000");
      gl.setClearColor(0x000000, 1);
    } else {
      scene.background = null;
      gl.setClearColor(0x000000, 0);
    }
  }, [gl, opaque, scene]);
  return null;
}

type SpaceBackgroundProps = {
  isMobile: boolean;
  sunDirection: [number, number, number];
  /** When false, only scene lights (globe illumination). Pair with full-viewport `StarfieldBackdrop` + transparent canvas. */
  includeStars?: boolean;
  /** When true, scene clears transparent so stars from a behind layer align across split layout. */
  transparentBackground?: boolean;
};

/** Drei star layers only — no lights. Use in a separate full-screen canvas so stars fill the viewport outside the globe column. */
export function StarfieldLayers({ isMobile }: { isMobile: boolean }) {
  return (
    <>
      <Stars
        radius={isMobile ? 320 : 420}
        depth={isMobile ? 80 : 120}
        count={isMobile ? 5000 : 9000}
        factor={isMobile ? 3.2 : 4.5}
        saturation={0.4}
        fade
        speed={0.25}
      />
      <Stars
        radius={isMobile ? 200 : 280}
        depth={isMobile ? 45 : 70}
        count={isMobile ? 2800 : 5500}
        factor={isMobile ? 6.5 : 8.5}
        saturation={0.35}
        fade={false}
        speed={0.55}
      />
    </>
  );
}

export function SpaceBackground({
  isMobile,
  sunDirection,
  includeStars = true,
  transparentBackground = false,
}: SpaceBackgroundProps) {
  return (
    <>
      <SceneClearTone opaque={!transparentBackground} />
      <ambientLight intensity={0.26} />
      <directionalLight
        position={[sunDirection[0] * 8, sunDirection[1] * 8, sunDirection[2] * 8]}
        intensity={1.85}
        color="#fff6e8"
      />
      <pointLight position={[-5.5, -3, -2.2]} intensity={0.28} color="#3b82f6" />
      <pointLight position={[0, 0, -7]} intensity={0.16} color="#64748b" />
      {includeStars ? <StarfieldLayers isMobile={isMobile} /> : null}
    </>
  );
}

/** Full-viewport WebGL layer so stars appear behind the whole page (e.g. right column in split layout). */
export function StarfieldBackdrop({
  isMobile,
  reducedMotion,
}: {
  isMobile: boolean;
  reducedMotion: boolean;
}) {
  const dpr: [number, number] = reducedMotion ? [1, 1.2] : [1, 1.5];
  return (
    <Canvas
      className="pointer-events-none absolute inset-0 size-full"
      dpr={dpr}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        outputColorSpace: SRGBColorSpace,
      }}
      camera={{ position: [0, 0, 1], fov: 75 }}
    >
      <color attach="background" args={["#000000"]} />
      <Suspense fallback={null}>
        <StarfieldLayers isMobile={isMobile} />
      </Suspense>
      {!reducedMotion && <AdaptiveDpr pixelated />}
    </Canvas>
  );
}
