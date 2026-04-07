"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Color, SRGBColorSpace, Texture } from "three";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { publicPath } from "@/lib/basePath";

const EARTH_TEXTURES = {
  topo: {
    low: publicPath("/bluemarble2k.jpg"),
    high: publicPath("/bluemarble8k.jpg"),
  },
  noTopo: {
    low: publicPath("/bluemarble2knotopo.jpg"),
    high: publicPath("/bluemarble8knotopo.jpg"),
  },
  night: publicPath("/blackmarble2k.jpg"),
};

type GlobeProps = {
  isMobile: boolean;
  reducedMotion: boolean;
  sunDirection: [number, number, number];
  useNoTopoTexture: boolean;
};

export function Globe({
  isMobile,
  reducedMotion,
  sunDirection,
  useNoTopoTexture,
}: GlobeProps) {
  const gl = useThree((s) => s.gl);
  const textureSet = useNoTopoTexture ? EARTH_TEXTURES.noTopo : EARTH_TEXTURES.topo;
  const [dayMapPath, setDayMapPath] = useState(textureSet.low);
  const nightMapPath = EARTH_TEXTURES.night;

  useEffect(() => {
    // On toggle change, immediately switch to low-res variant for quick feedback.
    setDayMapPath(textureSet.low);
  }, [textureSet.high, textureSet.low]);

  useEffect(() => {
    // Avoid loading 8k textures on constrained devices to reduce VRAM spikes.
    const nav = navigator as Navigator & { deviceMemory?: number };
    const memory = nav.deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    const prefersReducedData = window.matchMedia?.("(prefers-reduced-data: reduce)")?.matches;
    const canUpgrade =
      !isMobile && !reducedMotion && !prefersReducedData && memory >= 8 && cores >= 8;

    if (!canUpgrade) return;

    const w = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const scheduleUpgrade = () => setDayMapPath(textureSet.high);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(scheduleUpgrade, { timeout: 3000 });
      return () => {
        if (idleId !== null && typeof w.cancelIdleCallback === "function") {
          w.cancelIdleCallback(idleId);
        }
      };
    }

    timeoutId = setTimeout(scheduleUpgrade, 2500);
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [isMobile, reducedMotion, textureSet.high]);

  const onTexturesLoaded = useCallback(
    (loaded: Texture[]) => {
      const [dayTex, nightTex] = loaded;
      const maxAniso = Math.min(
        gl.capabilities.getMaxAnisotropy(),
        isMobile ? 4 : 8,
      );
      for (const tex of [dayTex, nightTex]) {
        tex.anisotropy = maxAniso;
        tex.needsUpdate = true;
      }
      dayTex.colorSpace = SRGBColorSpace;
      nightTex.colorSpace = SRGBColorSpace;
    },
    [gl, isMobile],
  );

  const [dayMap, nightMap] = useTexture(
    [dayMapPath, nightMapPath],
    onTexturesLoaded,
  );

  const sunTint = useMemo(() => new Color("#fff8ef"), []);
  // Higher segment count so a large day texture isn’t wasted on a faceted sphere.
  const segments = isMobile ? 80 : 160;

  return (
    <mesh renderOrder={0}>
      <sphereGeometry args={[1, segments, segments]} />
      <shaderMaterial
        key={`${dayMapPath}-${nightMapPath}`}
        toneMapped
        uniforms={{
          dayMap: { value: dayMap },
          nightMap: { value: nightMap },
          sunTint: { value: sunTint },
          sunDirection: { value: sunDirection },
        }}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;

          void main() {
            vUv = uv;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPosition.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;

          uniform sampler2D dayMap;
          uniform sampler2D nightMap;
          uniform vec3 sunTint;
          uniform vec3 sunDirection;

          void main() {
            vec3 N = normalize(vNormalW);
            vec3 V = normalize(cameraPosition - vWorldPos);
            vec3 lightDir = normalize(sunDirection);
            vec3 halfVec = normalize(lightDir + V);

            float ndlGeo = dot(N, lightDir);
            float daylight = smoothstep(-0.14, 0.2, ndlGeo);
            float diffuse = max(ndlGeo, 0.0);

            vec3 dayTex = texture2D(dayMap, vUv).rgb;
            vec3 nightTex = texture2D(nightMap, vUv).rgb;
            // Derive a soft pseudo-water mask from daytime albedo for Blue Marble-only workflows.
            float waterMask = smoothstep(0.16, 0.33, dayTex.b - dayTex.r * 0.22);

            vec3 radial = normalize(vWorldPos);
            float poleMix = pow(clamp(abs(radial.y), 0.0, 1.0), 1.35);
            float litHemisphere = smoothstep(0.02, 0.42, ndlGeo);
            float polarBoost = 1.0 + 0.36 * poleMix * litHemisphere;

            float specWide = pow(max(dot(N, halfVec), 0.0), 24.0) * mix(0.05, 0.3, waterMask);
            float specTight = pow(max(dot(N, halfVec), 0.0), 96.0) * waterMask;
            float specular = specWide + specTight;
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0) * daylight * 0.2;

            float ambientLift = 0.6;
            float diffuseLift = diffuse * 1.62;
            float oceanAlbedoBoost = 1.0 + waterMask * 0.22;
            vec3 dayColor =
              dayTex * sunTint * (ambientLift + diffuseLift) * polarBoost * oceanAlbedoBoost
              + vec3(specular * 0.44 + fresnel * (0.38 + waterMask * 0.72));
            // Extra sun-facing lift on water (texture-only mask — reads as clearer tropical blues).
            dayColor += waterMask * daylight * diffuse * vec3(0.04, 0.078, 0.11);

            vec3 earthshine = dayTex * vec3(0.11, 0.12, 0.14);
            // Keep city lights strongest on the dark side to avoid daytime overglow.
            float cityLightMask = pow(1.0 - daylight, 1.35);
            vec3 nightColor = nightTex * (1.9 * cityLightMask + 0.35) + earthshine;
            // Slight floor so oceans / unlit texture don’t match pure black space.
            nightColor += vec3(0.018, 0.022, 0.028);

            vec3 finalColor = mix(nightColor, dayColor, daylight) * 1.08;
            // Cool rim on the viewer-facing limb, stronger on the night hemisphere — reads as thin airlight vs the backdrop.
            float nv = max(dot(N, V), 0.0);
            float spaceRim = pow(1.0 - nv, 2.35);
            float darkSide = 1.0 - daylight;
            finalColor += vec3(0.09, 0.115, 0.15) * spaceRim * (0.4 + 0.6 * darkSide);
            gl_FragColor = vec4(finalColor, 1.0);
          }
        `}
      />
    </mesh>
  );
}
