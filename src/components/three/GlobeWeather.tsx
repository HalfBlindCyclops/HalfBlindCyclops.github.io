"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Mesh, Points as PointsType } from "three";

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

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(sunDirection);
    vec3 P = normalize(vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);

    vec3 drift = vec3(uTime * 0.012, uTime * 0.008, uTime * 0.005);
    vec3 q = P * 2.85 + drift;

    float coarse = fbm(q);
    float detail = fbm(q * 2.6 + vec3(19.2, 8.1, 33.7));
    float stormBand = fbm(q * 0.88 + vec3(200.0, 50.0, 10.0));
    stormBand = smoothstep(0.58, 0.92, stormBand);

    float lat = abs(P.y);
    float polarFade = smoothstep(0.84, 0.99, lat);
    float latMask = mix(1.0, 0.38, polarFade);

    float coverage = smoothstep(0.22, 0.62, coarse);
    float dens =
      coverage *
      (0.42 + 0.58 * smoothstep(0.25, 0.75, detail)) *
      latMask *
      (1.0 - 0.18 * stormBand);

    dens = pow(clamp(dens, 0.0, 1.0), 0.92);

    float ndl = dot(N, L);
    float day = smoothstep(-0.14, 0.26, ndl);
    float twilight = smoothstep(-0.38, 0.06, ndl) * (1.0 - day);

    float sunWrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    vec3 lit = mix(cloudShadow, cloudBright, day * (0.38 + 0.62 * sunWrap));
    lit = mix(lit, cloudStorm, stormBand * 0.42);
    lit += vec3(0.1, 0.12, 0.18) * twilight * dens;

    float silver = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    lit += vec3(0.14, 0.16, 0.2) * silver * day * dens * 0.85;

    float alpha =
      dens *
      (0.12 + 0.38 * day + 0.1 * twilight) *
      (1.0 - 0.2 * stormBand);
    alpha = clamp(alpha, 0.0, 0.52);
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

function randomUnit(out: Float32Array, i: number) {
  const u = Math.random() * 2 - 1;
  const v = Math.random() * 2 - 1;
  const w = Math.random() * 2 - 1;
  const len = Math.hypot(u, v, w) || 1;
  out[i] = u / len;
  out[i + 1] = v / len;
  out[i + 2] = w / len;
}

function PrecipitationShell({
  isMobile,
  reducedMotion,
}: Pick<GlobeWeatherProps, "isMobile" | "reducedMotion">) {
  const pointsRef = useRef<PointsType>(null);
  /** Fewer, subtler points — additive + high opacity read as noisy speckles. */
  const count = isMobile ? 90 : 260;

  const { geometry, radii, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const r = new Float32Array(count);
    const sp = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      randomUnit(positions, o);
      const radius = 1.012 + Math.random() * 0.032;
      r[i] = radius;
      positions[o] *= radius;
      positions[o + 1] *= radius;
      positions[o + 2] *= radius;
      sp[i] = 0.22 + Math.random() * 0.38;
    }
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(positions, 3));
    return { geometry: geom, radii: r, speeds: sp };
  }, [count]);

  useFrame((_, dt) => {
    if (reducedMotion) return;
    const pts = pointsRef.current;
    if (!pts) return;
    const pos = pts.geometry.attributes.position as BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      let x = arr[o];
      let y = arr[o + 1];
      let z = arr[o + 2];
      const len = Math.hypot(x, y, z) || 1e-4;
      const inv = 1 / len;
      const sp = speeds[i] * dt * 0.55;
      x -= x * inv * sp;
      y -= y * inv * sp;
      z -= z * inv * sp;
      const nl = Math.hypot(x, y, z);
      if (nl < 1.0035) {
        randomUnit(arr, o);
        const radius = radii[i];
        arr[o] *= radius;
        arr[o + 1] *= radius;
        arr[o + 2] *= radius;
      } else {
        arr[o] = x;
        arr[o + 1] = y;
        arr[o + 2] = z;
      }
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} renderOrder={2} frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <pointsMaterial
        color="#c5d8ec"
        size={isMobile ? 0.014 : 0.011}
        transparent
        opacity={isMobile ? 0.11 : 0.09}
        depthWrite={false}
        depthTest
        sizeAttenuation
        blending={NormalBlending}
      />
    </points>
  );
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
