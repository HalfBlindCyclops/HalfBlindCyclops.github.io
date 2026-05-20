"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Color,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Mesh } from "three";

type GlobeWeatherProps = {
  isMobile: boolean;
  reducedMotion: boolean;
  sunDirection: [number, number, number];
};

const cloudVertexShader = `
  varying vec3 vWorldPos;
  varying vec3 vNormalW;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const cloudFragmentShader = `
  varying vec3 vWorldPos;
  varying vec3 vNormalW;

  uniform vec3 sunDirection;
  uniform float uTime;
  uniform vec3 cloudBright;
  uniform vec3 cloudShadow;
  uniform vec3 cloudStorm;

  float g(vec3 i) {
    return fract(sin(dot(i, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(g(i + vec3(0, 0, 0)), g(i + vec3(1, 0, 0)), u.x),
        mix(g(i + vec3(0, 1, 0)), g(i + vec3(1, 1, 0)), u.x),
        u.y
      ),
      mix(
        mix(g(i + vec3(0, 0, 1)), g(i + vec3(1, 0, 1)), u.x),
        mix(g(i + vec3(0, 1, 1)), g(i + vec3(1, 1, 1)), u.x),
        u.y
      ),
      u.z
    );
  }

  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.52;
    for (int i = 0; i < 4; i++) {
      s += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return s;
  }

  float regionalMask(vec3 p) {
    // Create continent/ocean-scale isolated weather regions.
    float basinA = smoothstep(0.46, 0.78, fbm(p * 0.56 + vec3(14.0, 22.0, -11.0)));
    float basinB = smoothstep(0.52, 0.82, fbm(p * 0.62 + vec3(-30.0, 7.0, 18.0)));
    float basinC = smoothstep(0.48, 0.8, fbm(p * 0.58 + vec3(41.0, -16.0, 6.0)));
    return clamp(max(max(basinA, basinB), basinC), 0.0, 1.0);
  }

  float cycloneCell(vec3 p, vec3 center, float armCount, float spinRate, float seed) {
    vec3 helper = abs(center.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 basisX = normalize(cross(helper, center));
    vec3 basisY = normalize(cross(center, basisX));
    vec2 uv = vec2(dot(p, basisX), dot(p, basisY));
    float r = length(uv);
    float ang = atan(uv.y, uv.x);

    float eyeWall = smoothstep(0.24, 0.03, r);
    float outerFalloff = smoothstep(0.55, 0.08, r);
    float spiralPhase = ang * armCount - r * 30.0 + uTime * spinRate + seed;
    float spiral = 0.5 + 0.5 * sin(spiralPhase);
    float banded = smoothstep(0.5, 0.86, spiral);
    float turbulence = smoothstep(0.36, 0.82, fbm(p * 8.5 + vec3(seed, seed * 0.7, -seed * 0.4)));

    float cell = max(eyeWall * (0.6 + 0.4 * banded), banded * outerFalloff * turbulence);
    return clamp(cell, 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(sunDirection);
    vec3 P = normalize(vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec3 drift = vec3(uTime * 0.012, uTime * 0.008, uTime * 0.005);
    vec3 q = P * 2.85 + drift;
    vec3 qLarge = P * 1.55 + drift * 0.42;

    float coarse = fbm(q);
    float detail = fbm(q * 2.6 + vec3(19.2, 8.1, 33.7));
    float micro = fbm(q * 5.4 + vec3(-9.0, 31.0, 17.0));
    float stormBand = fbm(q * 0.88 + vec3(200.0, 50.0, 10.0));
    stormBand = smoothstep(0.58, 0.92, stormBand);
    float region = regionalMask(qLarge);
    float filament = smoothstep(0.53, 0.78, fbm(q * 1.9 + vec3(5.0, -13.0, 22.0)));
    float frontalNoise = smoothstep(0.54, 0.82, fbm(q * 3.2 + vec3(-25.0, 11.0, 9.0)));

    float lat = abs(P.y);
    float polarFade = smoothstep(0.84, 0.99, lat);
    float latMask = mix(1.0, 0.38, polarFade);
    float tropicalMask = smoothstep(0.74, 0.16, lat);
    float midLatitudeMask = smoothstep(0.08, 0.62, lat) * (1.0 - smoothstep(0.62, 0.88, lat));

    vec3 stormCenterA = normalize(vec3(
      sin(uTime * 0.022 + 0.8),
      0.22 + 0.08 * sin(uTime * 0.011 + 0.3),
      cos(uTime * 0.02 + 1.7)
    ));
    vec3 stormCenterB = normalize(vec3(
      cos(uTime * 0.018 + 2.5),
      -0.16 + 0.07 * sin(uTime * 0.013 + 1.8),
      sin(uTime * 0.024 + 3.1)
    ));
    vec3 stormCenterC = normalize(vec3(
      sin(uTime * 0.026 + 4.2),
      0.06 + 0.06 * cos(uTime * 0.014 + 2.3),
      cos(uTime * 0.019 + 5.0)
    ));
    float cycloneA = cycloneCell(P, stormCenterA, 5.0, 1.0, 11.0);
    float cycloneB = cycloneCell(P, stormCenterB, 4.0, -0.85, 37.0);
    float cycloneC = cycloneCell(P, stormCenterC, 6.0, 0.7, 71.0);
    float cycloneField = max(max(cycloneA, cycloneB), cycloneC) * tropicalMask;
    float frontalBands = frontalNoise * midLatitudeMask * (0.45 + 0.55 * region);
    float severeStorm = clamp(max(stormBand, cycloneField * 0.95), 0.0, 1.0);

    float coverage = smoothstep(0.16, 0.52, coarse);
    float dens =
      coverage *
      (0.3 + 0.7 * smoothstep(0.24, 0.78, detail)) *
      (0.55 + 0.45 * smoothstep(0.28, 0.82, micro)) *
      (0.22 + 0.78 * region) *
      (0.76 + 0.24 * filament) *
      latMask *
      (1.0 - 0.18 * severeStorm);
    dens += cycloneField * (0.2 + 0.15 * detail);
    dens += frontalBands * 0.12;

    dens = pow(clamp(dens, 0.0, 1.0), 0.9);

    float ndl = dot(N, L);
    float day = smoothstep(-0.14, 0.26, ndl);
    float night = 1.0 - day;
    float twilight = smoothstep(-0.38, 0.06, ndl) * (1.0 - day);

    float sunWrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    vec3 lit = mix(cloudShadow, cloudBright, day * (0.38 + 0.62 * sunWrap));
    lit = mix(lit, cloudStorm, severeStorm * 0.58 + frontalBands * 0.18);
    lit += vec3(0.1, 0.12, 0.18) * twilight * dens;

    float silver = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    lit += vec3(0.14, 0.16, 0.2) * silver * (0.45 + 0.55 * day) * dens * 0.85;

    float alpha =
      dens *
      (0.24 + 0.36 * day + 0.24 * night + 0.14 * twilight) *
      (1.0 - 0.16 * severeStorm);
    float baseCloudAlpha = smoothstep(0.26, 0.62, coarse) * 0.22 * latMask;
    baseCloudAlpha += cycloneField * 0.08;
    alpha = max(alpha, baseCloudAlpha);
    alpha = clamp(alpha, 0.0, 0.78);
    alpha *= smoothstep(0.0, 0.05, dens);

    gl_FragColor = vec4(lit, alpha);
  }
`;

function CloudLayer({
  isMobile,
  reducedMotion,
  sunDirection,
}: GlobeWeatherProps) {
  const meshRef = useRef<Mesh>(null);
  const sunVec = useMemo(
    () => new Vector3(sunDirection[0], sunDirection[1], sunDirection[2]).normalize(),
    [sunDirection],
  );
  const uniformSunDirection = useMemo(() => sunVec.clone(), [sunVec]);
  const cloudBright = useMemo(() => new Color("#f2f6fc"), []);
  const cloudShadow = useMemo(() => new Color("#3f4a60"), []);
  const cloudStorm = useMemo(() => new Color("#808ca3"), []);

  const segments = isMobile ? 64 : reducedMotion ? 78 : 96;
  /** Slightly above terrain so clouds sit over land/ocean without z-fighting. */
  const cloudRadius = 1.014;

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as ShaderMaterial;
    if (!reducedMotion) {
      if (mat.uniforms.uTime) mat.uniforms.uTime.value += dt;
      mesh.rotation.y += dt * (isMobile ? 0.012 : 0.016);
    }
    mat.uniforms.sunDirection.value.copy(sunVec);
  });

  return (
    <mesh ref={meshRef} renderOrder={6}>
      <sphereGeometry args={[cloudRadius, segments, segments]} />
      <shaderMaterial
        toneMapped
        transparent
        depthWrite={false}
        depthTest
        side={FrontSide}
        blending={NormalBlending}
        polygonOffset
        polygonOffsetFactor={-0.5}
        polygonOffsetUnits={-0.5}
        uniforms={{
          sunDirection: { value: uniformSunDirection },
          uTime: { value: 0 },
          cloudBright: { value: cloudBright },
          cloudShadow: { value: cloudShadow },
          cloudStorm: { value: cloudStorm },
        }}
        vertexShader={cloudVertexShader}
        fragmentShader={cloudFragmentShader}
      />
    </mesh>
  );
}

function PrecipitationShell({
  isMobile,
  reducedMotion,
}: Pick<GlobeWeatherProps, "isMobile" | "reducedMotion">) {
  void isMobile;
  void reducedMotion;
  return null;
}

/**
 * Procedural cloud shell + light precipitation streaks around the globe.
 */
export function GlobeWeather(props: GlobeWeatherProps) {
  return (
    <>
      <CloudLayer {...props} />
      <PrecipitationShell isMobile={props.isMobile} reducedMotion={props.reducedMotion} />
    </>
  );
}
