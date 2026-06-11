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
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = p * 2.17 + vec3(13.7, 5.1, 9.3);
      a *= 0.52;
    }
    return s;
  }

  // Ridged variant: produces thin streaky filaments for cirrus.
  float ridgedFbm(vec3 p) {
    float s = 0.0;
    float a = 0.58;
    for (int i = 0; i < 4; i++) {
      float n = 1.0 - abs(2.0 * vnoise(p) - 1.0);
      s += a * n * n;
      p = p * 2.31 + vec3(4.2, 8.8, 2.9);
      a *= 0.5;
    }
    return s;
  }

  float cycloneCell(vec3 p, vec3 center, float armCount, float spinRate, float seed) {
    vec3 helper = abs(center.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 basisX = normalize(cross(helper, center));
    vec3 basisY = normalize(cross(center, basisX));
    vec2 uv = vec2(dot(p, basisX), dot(p, basisY));
    float r = length(uv);
    if (r > 0.2) return 0.0;
    float ang = atan(uv.y, uv.x);

    // Noise-jittered polar coords so nothing about the storm is geometric.
    float n1 = fbm(p * 16.0 + vec3(seed, -seed * 0.6, seed * 0.3));
    float n2 = fbm(p * 34.0 + vec3(-seed * 0.4, seed, seed * 0.8));
    float rj = r * (1.0 + (n1 - 0.5) * 0.5);
    float angj = ang + (n1 - 0.5) * 1.4;

    // Differential rotation: inner bands spin visibly faster than the outskirts.
    float spin = uTime * spinRate * (0.55 + 1.1 / (1.0 + rj * 30.0));

    // Logarithmic spiral: arms wind tightly into the core like a real hurricane.
    float spiralPhase = angj * armCount - log(max(rj, 0.004)) * 5.0 + spin + seed;
    float spiral = 0.5 + 0.5 * sin(spiralPhase);
    // Rainbands grow wider and softer with distance from the eye.
    float armWidth = mix(0.78, 0.45, smoothstep(0.02, 0.16, rj));
    float arms = smoothstep(armWidth - 0.22, armWidth + 0.18, spiral);
    // Arms are made of broken convective clumps, not continuous ribbons.
    arms *= smoothstep(0.2, 0.68, n2);

    // Solid central dense overcast with a small clear eye punched out.
    float eyeHole = smoothstep(0.006, 0.018, rj);
    float core = smoothstep(0.075, 0.02, rj) * (0.85 + 0.15 * n2);
    // Rainbands fade out quickly; storm stays compact.
    float bandFalloff = smoothstep(0.19, 0.05, rj);
    // Faint high-altitude outflow shield (cirrus canopy) hazing the whole system.
    float canopy = smoothstep(0.17, 0.04, rj) * (0.18 + 0.14 * n1);

    float cell = max(core * (0.85 + 0.15 * arms), arms * bandFalloff);
    cell = max(cell, canopy);
    return clamp(cell * eyeHole, 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(sunDirection);
    vec3 P = normalize(vWorldPos);
    vec3 V = normalize(cameraPosition - vWorldPos);

    float lat = P.y;
    float absLat = abs(lat);

    vec3 drift = vec3(uTime * 0.014, uTime * 0.005, uTime * 0.0085);
    // Slow churn vector: morphs cloud shapes over time instead of pure translation.
    vec3 churn = vec3(sin(uTime * 0.021), cos(uTime * 0.016), sin(uTime * 0.013)) * 0.16;

    // Compress latitude in the sample domain so features stretch east-west,
    // reading as zonal weather systems instead of round blobs.
    vec3 Pz = vec3(P.x, P.y * 1.85, P.z);

    // Domain warp bends cloud masses into fronts, hooks, and filaments.
    vec3 q0 = Pz * 3.4 + drift;
    vec3 warp = vec3(
      fbm(q0 * 0.7 + vec3(11.3, 4.7, 21.9)),
      fbm(q0 * 0.7 + vec3(31.4, 15.9, 2.6)),
      fbm(q0 * 0.7 + vec3(7.1, 27.2, 12.5))
    ) - vec3(0.5);
    vec3 q = q0 + warp * 1.5;

    float base = fbm(q);
    float mid = fbm(q * 2.45 + vec3(19.2, 8.1, 33.7) + churn);
    float fine = fbm(q * 6.1 + vec3(-9.0, 31.0, 17.0) + churn * 1.7);
    float wisp = ridgedFbm(vec3(P.x, P.y * 2.7, P.z) * 2.2 + drift * 1.5 + warp * 0.7 + churn * 0.6);

    // Continent-scale modulation so systems stay discrete with real clear gaps.
    float region = smoothstep(0.36, 0.66, fbm(Pz * 0.85 + drift * 0.35 + vec3(41.0, -16.0, 6.0)));

    float polarFade = smoothstep(0.8, 0.97, absLat);
    float latMask = mix(1.0, 0.45, polarFade);
    float tropicalMask = smoothstep(0.62, 0.1, absLat);
    float midLatitudeMask = smoothstep(0.12, 0.42, absLat) * (1.0 - smoothstep(0.6, 0.86, absLat));
    // Convective band hugging the equator (ITCZ), clearer subtropics either side.
    float itczBand = exp(-pow(lat * 7.0, 2.0));
    float belts = clamp(midLatitudeMask * 0.95 + itczBand * 1.1 + 0.28, 0.0, 1.0);

    // Broken coverage: high threshold keeps most of the sphere clear.
    float coverage = smoothstep(0.5, 0.74, base * (0.74 + 0.26 * region));
    coverage *= belts * latMask;

    float dens = coverage;
    dens *= 0.4 + 0.6 * smoothstep(0.3, 0.78, mid);
    dens *= 0.55 + 0.45 * smoothstep(0.22, 0.82, fine);
    // Erode edges with fine noise so boundaries turn ragged, not airbrushed.
    dens = clamp(dens * 1.4 - 0.24 * (1.0 - smoothstep(0.2, 0.7, fine)), 0.0, 1.0);

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
    float cycloneA = cycloneCell(P, stormCenterA, 5.0, 1.0, 11.0);
    float cycloneB = cycloneCell(P, stormCenterB, 4.0, -0.85, 37.0);
    float cycloneField = max(cycloneA, cycloneB) * tropicalMask;
    dens = max(dens, cycloneField * (0.8 + 0.2 * fine));

    // Thin high-altitude cirrus streaks fill some clear sky with faint detail.
    float cirrus = smoothstep(0.62, 0.9, wisp) * (1.0 - dens) * latMask * (0.4 + 0.6 * region);

    // Hurricanes read bright white from space; only tint the deepest frontal cores gray.
    float severeStorm = clamp(smoothstep(0.78, 0.97, dens) * 0.6 - cycloneField * 0.4, 0.0, 1.0);

    float ndl = dot(N, L);
    float day = smoothstep(-0.14, 0.26, ndl);
    float twilight = smoothstep(-0.38, 0.06, ndl) * (1.0 - day);

    float sunWrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    vec3 lit = mix(cloudShadow, cloudBright, day * (0.38 + 0.62 * sunWrap));
    lit = mix(lit, cloudStorm, severeStorm * 0.5);
    // Self-shadowing in thick cores adds volume.
    lit *= 1.0 - 0.2 * smoothstep(0.45, 0.95, dens) * day;
    lit += vec3(0.1, 0.12, 0.18) * twilight * dens;

    float silver = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    lit += vec3(0.14, 0.16, 0.2) * silver * (0.45 + 0.55 * day) * dens * 0.85;

    // Lift mid densities so cloud bodies read solid instead of translucent haze.
    float alphaDens = pow(dens, 0.78);
    float alpha = alphaDens * (0.62 + 0.28 * day + 0.14 * twilight);
    alpha += cirrus * (0.2 + 0.12 * day);
    alpha = clamp(alpha, 0.0, 0.95);
    alpha *= smoothstep(0.012, 0.06, dens + cirrus);

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
