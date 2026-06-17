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
import { cloudFieldGLSL } from "@/components/three/cloudField.glsl";
import { advanceCloudSpin } from "@/components/three/cloudSpin";

type GlobeWeatherProps = {
  isMobile: boolean;
  reducedMotion: boolean;
  sunDirection: [number, number, number];
  /** True while the camera is locked onto a node — spins the clouds faster so motion is visible. */
  focused: boolean;
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
  uniform float uSpin;
  uniform vec3 cloudBright;
  uniform vec3 cloudShadow;
  uniform vec3 cloudStorm;

  ${cloudFieldGLSL}

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(sunDirection);
    vec3 P = normalize(vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);

    float cirrus;
    float severeStorm;
    float dens = cf_cloudSample(P, uTime, uSpin, cirrus, severeStorm);

    float ndl = dot(N, L);
    float day = smoothstep(-0.14, 0.26, ndl);
    float twilight = smoothstep(-0.38, 0.06, ndl) * (1.0 - day);

    float night = 1.0 - smoothstep(-0.25, 0.05, ndl);
    float sunWrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    vec3 lit = mix(cloudShadow, cloudBright, day * (0.38 + 0.62 * sunWrap));
    lit = mix(lit, cloudStorm, severeStorm * 0.5);
    // Self-shadowing in thick cores adds volume.
    lit *= 1.0 - 0.2 * smoothstep(0.45, 0.95, dens) * day;
    lit += vec3(0.1, 0.12, 0.18) * twilight * dens;
    // Faint earthshine/city-glow lift so clouds stay readable on the night side.
    lit += vec3(0.16, 0.19, 0.26) * night * dens;

    float silver = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    lit += vec3(0.14, 0.16, 0.2) * silver * (0.45 + 0.55 * day) * dens * 0.85;

    // Lift mid densities hard so cloud bodies read as solid overcast, not translucent haze.
    float alphaDens = pow(dens, 0.56);
    float alpha = alphaDens * (0.92 + 0.14 * day + 0.1 * twilight + 0.12 * night);
    alpha += cirrus * (0.32 + 0.12 * day);
    alpha = clamp(alpha, 0.0, 1.0);
    alpha *= smoothstep(0.01, 0.05, dens + cirrus);

    gl_FragColor = vec4(lit, alpha);
  }
`;

function CloudLayer({
  isMobile,
  reducedMotion,
  sunDirection,
  focused,
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

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as ShaderMaterial;
    // Spin is driven by a shared accumulator so the cloud shell and the Earth surface shadow
    // sampler use the identical angle. Rate is slow when idle, faster when locked on a node.
    const spin = advanceCloudSpin(state.clock.elapsedTime, delta, focused, reducedMotion);
    if (mat.uniforms.uSpin) mat.uniforms.uSpin.value = spin;
    if (!reducedMotion && mat.uniforms.uTime) {
      // Drive uTime from the shared R3F clock so the morphing/storm motion matches the Earth
      // surface sampler. (Rotating the mesh itself is a no-op since noise is in world space.)
      mat.uniforms.uTime.value = state.clock.elapsedTime;
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
          uSpin: { value: 0 },
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
