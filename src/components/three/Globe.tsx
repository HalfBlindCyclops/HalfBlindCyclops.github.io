"use client";

import { useCallback, useMemo, useRef } from "react";
import { Color, SRGBColorSpace, Texture, Vector3 } from "three";
import type { Mesh } from "three";
import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { publicPath } from "@/lib/basePath";
import { cloudFieldGLSL } from "@/components/three/cloudField.glsl";
import { advanceCloudSpin } from "@/components/three/cloudSpin";

/**
 * Flat Blue Marble (no shaded relief). High WebP uses max WebP width (16383px); baked from 21600×10800 source.
 * If GPU memory or upload stalls matter, consider KTX2/Basis (etc.) instead of large decoded bitmaps.
 */
const DAY_MAP = publicPath("/8k.jpg");
const NIGHT_MAP = publicPath("/blackmarble2k.webp");

type GlobeProps = {
  isMobile: boolean;
  reducedMotion: boolean;
  sunDirection: [number, number, number];
  /** True while the camera is locked onto a node (drives the shared cloud spin rate). */
  focused: boolean;
};

export function Globe({ isMobile, reducedMotion, sunDirection, focused }: GlobeProps) {
  const gl = useThree((s) => s.gl);
  const dayMapPath = DAY_MAP;
  const nightMapPath = NIGHT_MAP;

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
  const meshRef = useRef<Mesh>(null);
  const sunVec = useMemo(
    () => new Vector3(sunDirection[0], sunDirection[1], sunDirection[2]).normalize(),
    [sunDirection],
  );
  const sunUniform = useMemo(() => sunVec.clone(), [sunVec]);
  // Skip the (relatively expensive) cloud-field evaluation on mobile to protect fragment cost.
  const cloudShadowStrength = isMobile ? 0 : 0.5;
  // Higher segment count so a large day texture isn’t wasted on a faceted sphere.
  const segments = isMobile ? 56 : reducedMotion ? 88 : 112;

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as { uniforms?: Record<string, { value: unknown }> };
    if (!mat.uniforms) return;
    (mat.uniforms.sunDirection.value as Vector3).copy(sunVec);
    // Match the cloud shell's clock-driven uTime + shared spin so shadows track the clouds.
    const spin = advanceCloudSpin(state.clock.elapsedTime, delta, focused, reducedMotion);
    if (mat.uniforms.uSpin) mat.uniforms.uSpin.value = spin;
    if (!reducedMotion && mat.uniforms.uTime) {
      mat.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={0}>
      <sphereGeometry args={[1, segments, segments]} />
      <shaderMaterial
        key={`${dayMapPath}-${nightMapPath}`}
        toneMapped
        uniforms={{
          dayMap: { value: dayMap },
          nightMap: { value: nightMap },
          sunTint: { value: sunTint },
          sunDirection: { value: sunUniform },
          uTime: { value: 0 },
          uSpin: { value: 0 },
          uCloudShadowStrength: { value: cloudShadowStrength },
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
          uniform float uTime;
          uniform float uSpin;
          uniform float uCloudShadowStrength;

          ${cloudFieldGLSL}

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

            // Cloud shadows: sample the shared cloud field slightly toward the sun so thick
            // clouds darken the lit ground beneath them. Skipped at night / on mobile (strength 0).
            if (uCloudShadowStrength > 0.0 && daylight > 0.001) {
              vec3 shadowDir = normalize(radial + lightDir * 0.05);
              float cloudDens = cf_cloudDensity(shadowDir, uTime, uSpin);
              float shade = smoothstep(0.16, 0.72, cloudDens) * uCloudShadowStrength * daylight;
              dayColor *= 1.0 - shade;
            }

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
