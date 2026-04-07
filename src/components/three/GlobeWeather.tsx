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

    float lat = abs(P.y);
    float polarFade = smoothstep(0.84, 0.99, lat);
    float latMask = mix(1.0, 0.38, polarFade);

    float coverage = smoothstep(0.24, 0.64, coarse);
    float dens =
      coverage *
      (0.3 + 0.7 * smoothstep(0.24, 0.78, detail)) *
      (0.55 + 0.45 * smoothstep(0.28, 0.82, micro)) *
      (0.22 + 0.78 * region) *
      (0.76 + 0.24 * filament) *
      latMask *
      (1.0 - 0.18 * stormBand);

    dens = pow(clamp(dens, 0.0, 1.0), 1.05);

    float ndl = dot(N, L);
    float day = smoothstep(-0.14, 0.26, ndl);
    float night = 1.0 - day;
    float twilight = smoothstep(-0.38, 0.06, ndl) * (1.0 - day);

    float sunWrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    vec3 lit = mix(cloudShadow, cloudBright, day * (0.38 + 0.62 * sunWrap));
    lit = mix(lit, cloudStorm, stormBand * 0.42);
    lit += vec3(0.1, 0.12, 0.18) * twilight * dens;

    float silver = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    lit += vec3(0.14, 0.16, 0.2) * silver * (0.45 + 0.55 * day) * dens * 0.85;

    float alpha =
      dens *
      (0.16 + 0.27 * day + 0.16 * night + 0.1 * twilight) *
      (1.0 - 0.2 * stormBand);
    alpha = clamp(alpha, 0.0, 0.5);
    alpha *= smoothstep(0.0, 0.08, dens);

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
  const cloudBright = useMemo(() => new Color("#f2f6fc"), []);
  const cloudShadow = useMemo(() => new Color("#1c2333"), []);
  const cloudStorm = useMemo(() => new Color("#5c6578"), []);

  const segments = isMobile ? 88 : 128;
  /** Slightly above terrain so clouds sit over land/ocean without z-fighting. */
  const cloudRadius = 1.008;

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as ShaderMaterial;
    if (!reducedMotion) {
      if (mat.uniforms.uTime) mat.uniforms.uTime.value += dt;
      mesh.rotation.y += dt * 0.018;
    }
    mat.uniforms.sunDirection.value.copy(sunVec);
  });

  return (
    <mesh ref={meshRef} renderOrder={1}>
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
          sunDirection: { value: sunVec.clone() },
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
