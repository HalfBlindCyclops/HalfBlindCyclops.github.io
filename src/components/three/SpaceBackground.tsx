"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Sprite,
  SRGBColorSpace,
  Vector3,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { resumeNodes } from "@/data/resumeNodes";
import { publicPath } from "@/lib/basePath";
import { latLonToSceneWorld } from "@/lib/geo";

/** Black clear; `opaque={false}` only if stacking under another GL/HTML layer. */
function SceneClearTone({ opaque }: { opaque: boolean }) {
  const { gl } = useThree();
  useLayoutEffect(() => {
    if (opaque) {
      gl.setClearColor(0x000000, 1);
    } else {
      gl.setClearColor(0x000000, 0);
    }
  }, [gl, opaque]);
  return null;
}

type SpaceBackgroundProps = {
  sunDirection: [number, number, number];
  isMobile: boolean;
  transparentBackground?: boolean;
};

/** Pitch sky texture (rad, +X axis) so the milky-way band sits lower when the camera looks down over Boston. */
const SKY_BACKDROP_PITCH = -0.62;

/**
 * Bump when replacing sky WebPs so caches bust. Desktop: 4096×2048; mobile: 2048×1024 (`space-background-sm.webp`).
 * GPU-compressed maps (KTX2/Basis) could replace these if decode/VRAM on load becomes an issue.
 */
const SPACE_BACKGROUND_CACHE_KEY = "starmap-4k2k-20250407";

function spaceBackgroundTextureUrl(isMobile: boolean): string {
  const file = isMobile ? "/space-background-sm.webp" : "/space-background.webp";
  const path = publicPath(file);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${SPACE_BACKGROUND_CACHE_KEY}`;
}

function SpacePhotoBackdrop({
  opacity = 0.52,
  isMobile,
}: {
  opacity?: number;
  isMobile: boolean;
}) {
  const texture = useTexture(spaceBackgroundTextureUrl(isMobile));
  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace;
  }, [texture]);
  return (
    <mesh renderOrder={-1000} rotation={[SKY_BACKDROP_PITCH, Math.PI, 0]}>
      <sphereGeometry args={[520, 64, 64]} />
      <meshBasicMaterial
        map={texture}
        side={BackSide}
        transparent
        opacity={opacity}
        toneMapped={false}
        depthWrite={false}
        depthTest
      />
    </mesh>
  );
}

function makeSunCoreTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);

  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 8, c, c, c);
  g.addColorStop(0, "rgba(255,253,245,1)");
  g.addColorStop(0.18, "rgba(255,236,188,0.98)");
  g.addColorStop(0.44, "rgba(255,190,110,0.78)");
  g.addColorStop(0.72, "rgba(255,138,62,0.34)");
  g.addColorStop(1, "rgba(255,120,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

function makeSunRaysTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);

  const c = size / 2;
  ctx.translate(c, c);
  for (let i = 0; i < 28; i += 1) {
    const angle = (Math.PI * 2 * i) / 28;
    ctx.save();
    ctx.rotate(angle);
    const ray = ctx.createLinearGradient(0, 0, c * 0.8, 0);
    ray.addColorStop(0, "rgba(255,228,150,0)");
    ray.addColorStop(0.32, "rgba(255,210,120,0.14)");
    ray.addColorStop(0.72, "rgba(255,186,106,0.08)");
    ray.addColorStop(1, "rgba(255,168,86,0)");
    ctx.fillStyle = ray;
    ctx.fillRect(0, -1, c * 0.82, 2);
    ctx.restore();
  }

  const core = ctx.createRadialGradient(0, 0, 6, 0, 0, c);
  core.addColorStop(0, "rgba(255,245,200,0.35)");
  core.addColorStop(0.5, "rgba(255,210,130,0.15)");
  core.addColorStop(1, "rgba(255,170,90,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, c, 0, Math.PI * 2);
  ctx.fill();

  return new CanvasTexture(canvas);
}

function makeCircularMaskTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);

  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, c * 0.86, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.9, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

function makeCrescentShadowTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);

  const c = size / 2;
  // Start with a soft full-disc shadow.
  const base = ctx.createRadialGradient(c, c, c * 0.28, c, c, c * 0.98);
  base.addColorStop(0, "rgba(0,0,0,0)");
  base.addColorStop(0.62, "rgba(0,0,0,0.18)");
  base.addColorStop(1, "rgba(0,0,0,0.48)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Carve out a brighter lobe to leave a crescent darkness on one side.
  ctx.globalCompositeOperation = "destination-out";
  const cut = ctx.createRadialGradient(c * 0.78, c * 0.5, c * 0.08, c * 0.78, c * 0.5, c * 0.7);
  cut.addColorStop(0, "rgba(0,0,0,1)");
  cut.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cut;
  ctx.beginPath();
  ctx.arc(c * 0.78, c * 0.5, c * 0.74, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  return new CanvasTexture(canvas);
}

function SunMoonLayer({ sunDirection }: { sunDirection: [number, number, number] }) {
  const sunDir = useMemo(() => new Vector3(...sunDirection).normalize(), [sunDirection]);
  const moonDir = useMemo(() => {
    const aboutNode = resumeNodes.find((node) => node.id === "about");
    const aboutLatitude = aboutNode?.latitude ?? 0;
    const aboutLongitude = aboutNode?.longitude ?? 0;
    // Place moon at the antipode of the About node so it stays opposite that section.
    return latLonToSceneWorld(-aboutLatitude, aboutLongitude + 180, 1).normalize();
  }, []);
  const sunPos = useMemo(() => sunDir.clone().multiplyScalar(42), [sunDir]);
  const moonPos = useMemo(() => moonDir.clone().multiplyScalar(44), [moonDir]);
  const raysRef = useRef<Sprite>(null);
  const moonTexture = useTexture(publicPath("/moon-texture-craters.webp"));
  const moonMaskTexture = useMemo(() => makeCircularMaskTexture(), []);
  const moonCrescentShadowTexture = useMemo(() => makeCrescentShadowTexture(), []);
  const sunCoreTexture = useMemo(() => makeSunCoreTexture(), []);
  const sunRaysTexture = useMemo(() => makeSunRaysTexture(), []);

  useFrame((state) => {
    if (raysRef.current) {
      raysRef.current.material.rotation = state.clock.elapsedTime * 0.06;
    }
  });

  return (
    <>
      <sprite position={sunPos.toArray()} scale={[17, 17, 1]}>
        <spriteMaterial
          map={sunCoreTexture}
          transparent
          depthWrite={false}
          depthTest
          blending={AdditiveBlending}
        />
      </sprite>
      <sprite ref={raysRef} position={sunPos.toArray()} scale={[24, 24, 1]}>
        <spriteMaterial
          map={sunRaysTexture}
          transparent
          depthWrite={false}
          depthTest
          opacity={0.72}
          blending={AdditiveBlending}
        />
      </sprite>
      <sprite position={moonPos.toArray()} scale={[3.5, 3.5, 1]}>
        <spriteMaterial
          map={moonTexture}
          alphaMap={moonMaskTexture}
          alphaTest={0.02}
          transparent
          depthWrite={false}
          depthTest
          color="#73829b"
          opacity={0.74}
        />
      </sprite>
      <sprite position={moonPos.toArray()} scale={[3.52, 3.52, 1]}>
        <spriteMaterial
          map={moonCrescentShadowTexture}
          alphaMap={moonMaskTexture}
          alphaTest={0.02}
          transparent
          depthWrite={false}
          depthTest
          color="#000000"
          opacity={0.36}
        />
      </sprite>
    </>
  );
}

export function SpaceBackground({
  sunDirection,
  isMobile,
  transparentBackground = false,
}: SpaceBackgroundProps) {
  return (
    <>
      <SceneClearTone opaque={!transparentBackground} />
      {!transparentBackground ? <SpacePhotoBackdrop opacity={0.78} isMobile={isMobile} /> : null}
      <ambientLight intensity={0.26} />
      <directionalLight
        position={[sunDirection[0] * 8, sunDirection[1] * 8, sunDirection[2] * 8]}
        intensity={1.85}
        color="#fff6e8"
      />
      <pointLight position={[-5.5, -3, -2.2]} intensity={0.28} color="#3b82f6" />
      <pointLight position={[0, 0, -7]} intensity={0.16} color="#64748b" />
      <SunMoonLayer sunDirection={sunDirection} />
    </>
  );
}
