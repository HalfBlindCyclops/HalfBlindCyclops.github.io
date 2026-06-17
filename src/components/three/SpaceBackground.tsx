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
  reducedMotion: boolean;
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
  reducedMotion,
}: {
  opacity?: number;
  isMobile: boolean;
  reducedMotion: boolean;
}) {
  const texture = useTexture(spaceBackgroundTextureUrl(isMobile), (loaded) => {
    loaded.colorSpace = SRGBColorSpace;
  });
  const segments = isMobile ? 28 : reducedMotion ? 32 : 40;
  return (
    <mesh renderOrder={-1000} rotation={[SKY_BACKDROP_PITCH, Math.PI, 0]}>
      <sphereGeometry args={[520, segments, segments]} />
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

function makeCanvas512() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  return { canvas, ctx: canvas.getContext("2d") };
}

function makeSunCoreTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas512();
  if (!ctx) return new CanvasTexture(canvas);
  const c = 256;
  const g = ctx.createRadialGradient(c, c, 8, c, c, c);
  g.addColorStop(0, "rgba(255,253,245,1)");
  g.addColorStop(0.18, "rgba(255,236,188,0.98)");
  g.addColorStop(0.44, "rgba(255,190,110,0.78)");
  g.addColorStop(0.72, "rgba(255,138,62,0.34)");
  g.addColorStop(1, "rgba(255,120,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return new CanvasTexture(canvas);
}

/** Seeded LCG so ray jitter is deterministic across renders. */
function lcgRand(seedRef: { v: number }): number {
  seedRef.v = (Math.imul(seedRef.v, 1664525) + 1013904223) | 0;
  return ((seedRef.v >>> 0) / 0xffffffff);
}

function makeSunRaysTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas512();
  if (!ctx) return new CanvasTexture(canvas);
  const c = 256;
  ctx.translate(c, c);
  const rng = { v: 0x9e3779b9 };

  // Primary rays: longer tapered streaks with organic spacing.
  const primaryCount = 14;
  for (let i = 0; i < primaryCount; i += 1) {
    const baseAngle = (Math.PI * 2 * i) / primaryCount;
    const angle = baseAngle + (lcgRand(rng) - 0.5) * 0.28;
    const len = c * (0.68 + lcgRand(rng) * 0.26);
    const halfBase = 3.5 + lcgRand(rng) * 3.5;
    const alpha = 0.13 + lcgRand(rng) * 0.10;
    ctx.save();
    ctx.rotate(angle);
    // Tapered triangle: wide at inner edge, comes to a point at the far end.
    ctx.beginPath();
    ctx.moveTo(c * 0.07, -halfBase);
    ctx.lineTo(c * 0.07, halfBase);
    ctx.lineTo(len, 0.4);
    ctx.lineTo(len, -0.4);
    ctx.closePath();
    const grad = ctx.createLinearGradient(c * 0.07, 0, len, 0);
    grad.addColorStop(0, `rgba(255,248,220,${alpha})`);
    grad.addColorStop(0.4, `rgba(255,228,170,${(alpha * 0.6).toFixed(3)})`);
    grad.addColorStop(1, "rgba(255,200,130,0)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // Secondary rays: shorter, dimmer, denser — fill gaps between primaries.
  const secondaryCount = 22;
  for (let i = 0; i < secondaryCount; i += 1) {
    const baseAngle = (Math.PI * 2 * i) / secondaryCount;
    const angle = baseAngle + (lcgRand(rng) - 0.5) * 0.35;
    const len = c * (0.36 + lcgRand(rng) * 0.26);
    const halfBase = 1.2 + lcgRand(rng) * 1.8;
    const alpha = 0.05 + lcgRand(rng) * 0.06;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(c * 0.09, -halfBase);
    ctx.lineTo(c * 0.09, halfBase);
    ctx.lineTo(len, 0.2);
    ctx.lineTo(len, -0.2);
    ctx.closePath();
    const grad = ctx.createLinearGradient(c * 0.09, 0, len, 0);
    grad.addColorStop(0, `rgba(255,242,210,${alpha})`);
    grad.addColorStop(0.55, `rgba(255,218,160,${(alpha * 0.45).toFixed(3)})`);
    grad.addColorStop(1, "rgba(255,190,110,0)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // Soft inner corona halo on top of the rays.
  const halo = ctx.createRadialGradient(0, 0, c * 0.05, 0, 0, c * 0.82);
  halo.addColorStop(0, "rgba(255,252,235,0.26)");
  halo.addColorStop(0.18, "rgba(255,238,195,0.14)");
  halo.addColorStop(0.52, "rgba(255,210,145,0.06)");
  halo.addColorStop(1, "rgba(255,175,100,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, c, 0, Math.PI * 2);
  ctx.fill();

  return new CanvasTexture(canvas);
}

/** Large diffuse bloom — no rays, just a warm radial glow for the outer corona. */
function makeSunBloomTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas512();
  if (!ctx) return new CanvasTexture(canvas);
  const c = 256;
  const g = ctx.createRadialGradient(c, c, c * 0.01, c, c, c);
  g.addColorStop(0, "rgba(255,252,235,0.52)");
  g.addColorStop(0.07, "rgba(255,242,205,0.36)");
  g.addColorStop(0.22, "rgba(255,220,165,0.15)");
  g.addColorStop(0.50, "rgba(255,195,120,0.06)");
  g.addColorStop(1, "rgba(255,165,85,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return new CanvasTexture(canvas);
}

function makeCircularMaskTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas512();
  if (!ctx) return new CanvasTexture(canvas);
  const c = 256;
  const g = ctx.createRadialGradient(c, c, c * 0.86, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.9, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return new CanvasTexture(canvas);
}

function makeCrescentShadowTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas512();
  if (!ctx) return new CanvasTexture(canvas);
  const c = 256;
  // Start with a soft full-disc shadow.
  const base = ctx.createRadialGradient(c, c, c * 0.28, c, c, c * 0.98);
  base.addColorStop(0, "rgba(0,0,0,0)");
  base.addColorStop(0.62, "rgba(0,0,0,0.18)");
  base.addColorStop(1, "rgba(0,0,0,0.48)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
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
  const sunBloomTexture = useMemo(() => makeSunBloomTexture(), []);

  useFrame((state) => {
    if (raysRef.current) {
      // Very slow drift — corona barely rotates, not a pinwheel.
      raysRef.current.material.rotation = state.clock.elapsedTime * 0.018;
    }
  });

  return (
    <>
      {/* Outer diffuse bloom — static, large, very soft */}
      <sprite position={sunPos.toArray()} scale={[62, 62, 1]}>
        <spriteMaterial
          map={sunBloomTexture}
          transparent
          depthWrite={false}
          depthTest
          opacity={0.55}
          blending={AdditiveBlending}
        />
      </sprite>
      {/* Tapered streaking rays — slow drift */}
      <sprite ref={raysRef} position={sunPos.toArray()} scale={[34, 34, 1]}>
        <spriteMaterial
          map={sunRaysTexture}
          transparent
          depthWrite={false}
          depthTest
          opacity={0.82}
          blending={AdditiveBlending}
        />
      </sprite>
      {/* Bright solar disc core */}
      <sprite position={sunPos.toArray()} scale={[16, 16, 1]}>
        <spriteMaterial
          map={sunCoreTexture}
          transparent
          depthWrite={false}
          depthTest
          blending={AdditiveBlending}
        />
      </sprite>
      <sprite position={moonPos.toArray()} scale={[1.17, 1.17, 1]}>
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
      <sprite position={moonPos.toArray()} scale={[1.18, 1.18, 1]}>
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
  reducedMotion,
  transparentBackground = false,
}: SpaceBackgroundProps) {
  return (
    <>
      <SceneClearTone opaque={!transparentBackground} />
      {!transparentBackground ? (
        <SpacePhotoBackdrop opacity={0.78} isMobile={isMobile} reducedMotion={reducedMotion} />
      ) : null}
      <ambientLight intensity={0.26} />
      <directionalLight
        position={[sunDirection[0] * 8, sunDirection[1] * 8, sunDirection[2] * 8]}
        intensity={1.85}
        color="#fff6e8"
      />
      {!isMobile ? <pointLight position={[-5.5, -3, -2.2]} intensity={0.28} color="#3b82f6" /> : null}
      <pointLight position={[0, 0, -7]} intensity={isMobile ? 0.1 : 0.16} color="#64748b" />
      <SunMoonLayer sunDirection={sunDirection} />
    </>
  );
}
