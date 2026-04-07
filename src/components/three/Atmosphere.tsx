"use client";

import { BackSide, Color, FrontSide, NormalBlending } from "three";
import { useMemo } from "react";

type AtmosphereProps = {
  sunDirection: [number, number, number];
};

/**
 * Layered atmosphere: bulk air shell (wide viewing path) + near-surface haze + outer limb shell.
 * Uses NormalBlending (not stacked additive shells) for more photographic falloff.
 */
export function Atmosphere({ sunDirection }: AtmosphereProps) {
  const rayleighColor = useMemo(() => new Color("#4f8fd4"), []);
  const mieColor = useMemo(() => new Color("#b8cce8"), []);
  const nightAirglow = useMemo(() => new Color("#1e3558"), []);
  const hazeColor = useMemo(() => new Color("#7ca8d4"), []);
  const bulkDayAir = useMemo(() => new Color("#355a82"), []);
  const bulkTwilightAir = useMemo(() => new Color("#454e6a"), []);

  return (
    <>
      {/*
        Middle shell: fills the gap between Earth (~1) and outer limb — long viewing paths
        (low dot(P,V)) get strong inscatter so “air” reads as a volume, not only a ring.
      */}
      <mesh renderOrder={2}>
        <sphereGeometry args={[1.012, 80, 80]} />
        <shaderMaterial
          blending={NormalBlending}
          transparent
          depthWrite={false}
          side={FrontSide}
          toneMapped
          uniforms={{
            sunDirection: { value: sunDirection },
            bulkDayAir: { value: bulkDayAir },
            bulkTwilightAir: { value: bulkTwilightAir },
          }}
          vertexShader={`
            varying vec3 vWorldPos;

            void main() {
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `}
          fragmentShader={`
            varying vec3 vWorldPos;

            uniform vec3 sunDirection;
            uniform vec3 bulkDayAir;
            uniform vec3 bulkTwilightAir;

            void main() {
              vec3 P = normalize(vWorldPos);
              vec3 V = normalize(cameraPosition - vWorldPos);
              vec3 L = normalize(sunDirection);
              float mu = clamp(dot(P, V), 0.0, 1.0);
              float broad = pow(1.0 - mu, 1.05);
              float limb = pow(1.0 - mu, 3.4);

              float sunDot = dot(P, L);
              float day = smoothstep(-0.22, 0.4, sunDot);
              float night = smoothstep(0.06, -0.38, sunDot);
              float twi = (1.0 - day) * (1.0 - night);

              vec3 dayCol = bulkDayAir * day;
              vec3 twiCol = bulkTwilightAir * twi * 0.88;
              vec3 nightCol = vec3(0.14, 0.18, 0.32) * night * 0.55;

              float density = broad * 0.34 + limb * 0.27;
              vec3 rgb = (dayCol + twiCol + nightCol) * density * 0.92;

              float aBroad = broad * (0.045 + day * 0.125 + night * 0.036 + twi * 0.07);
              float aLimb = limb * (0.058 + day * 0.095 + twi * 0.055);
              float a = clamp(aBroad + aLimb, 0.0, 0.34);
              gl_FragColor = vec4(rgb, a);
            }
          `}
        />
      </mesh>

      {/* Primary limb / terminator scattering (back faces of a slightly larger sphere) */}
      <mesh renderOrder={4}>
        <sphereGeometry args={[1.022, 96, 96]} />
        <shaderMaterial
          blending={NormalBlending}
          transparent
          depthWrite={false}
          side={BackSide}
          toneMapped
          uniforms={{
            sunDirection: { value: sunDirection },
            rayleighColor: { value: rayleighColor },
            mieColor: { value: mieColor },
            nightAirglow: { value: nightAirglow },
            rayleighStrength: { value: 0.66 },
            mieStrength: { value: 0.22 },
            nightStrength: { value: 0.4 },
            limbPower: { value: 4.05 },
            limbSilhouette: { value: 0.3 },
            limbAlphaFloor: { value: 0.46 },
            limbBodyOpacity: { value: 0.32 },
          }}
          vertexShader={`
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;

            void main() {
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `}
          fragmentShader={`
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;

            uniform vec3 sunDirection;
            uniform vec3 rayleighColor;
            uniform vec3 mieColor;
            uniform vec3 nightAirglow;
            uniform float rayleighStrength;
            uniform float mieStrength;
            uniform float nightStrength;
            uniform float limbPower;
            uniform float limbSilhouette;
            uniform float limbAlphaFloor;
            uniform float limbBodyOpacity;

            void main() {
              vec3 P = normalize(vWorldPos);
              vec3 V = normalize(cameraPosition - vWorldPos);
              vec3 L = normalize(sunDirection);

              // Limb thickness ~ grazing view through shell (longer path)
              float cosPv = clamp(dot(P, V), -1.0, 1.0);
              float limb = pow(1.0 - abs(cosPv), limbPower);

              float sunDot = dot(P, L);
              float dayMask = smoothstep(-0.12, 0.38, sunDot);
              float nightMask = smoothstep(0.08, -0.42, sunDot);
              float twilight = exp(-pow(abs(sunDot) / 0.22, 2.0));

              // Rayleigh-ish phase (view vs sun)
              float cosVS = clamp(dot(V, L), -1.0, 1.0);
              float rayleighPhase = 0.75 * (1.0 + cosVS * cosVS);

              // Mie forward lobe (simplified Henyey-Greenstein)
              float g = -0.78;
              float mieDenom = 1.0 + g * g + 2.0 * g * cosVS;
              float miePhase = (1.0 - g * g) / pow(max(mieDenom, 1e-4), 1.5);

              vec3 rayleigh = rayleighColor * rayleighPhase * rayleighStrength * dayMask;
              vec3 mie = mieColor * miePhase * mieStrength * dayMask;
              vec3 dusk = vec3(0.85, 0.48, 0.35) * twilight * 0.125 * limb;
              vec3 night = nightAirglow * nightStrength * nightMask;
              vec3 silhouette =
                vec3(0.32, 0.38, 0.52) * limbSilhouette * pow(limb, 0.63);
              vec3 outerRim = vec3(0.2, 0.25, 0.34) * pow(limb, 4.9) * 1.42;
              vec3 airBody =
                vec3(0.38, 0.48, 0.64) * limbBodyOpacity * pow(limb, 0.46);

              vec3 rgb =
                (rayleigh + mie + dusk + night) * limb + silhouette + outerRim + airBody;
              float aColor = length(rgb) * 1.28;
              float aLimb = pow(limb, 0.74) * limbAlphaFloor;
              float aBody = pow(limb, 0.52) * limbBodyOpacity * 0.9;
              float a = clamp(max(max(aColor, aLimb), aBody), 0.0, 0.78);
              gl_FragColor = vec4(rgb, a);
            }
          `}
        />
      </mesh>

      {/* Near-surface haze: very close shell for tight planet-hugging air glow */}
      <mesh renderOrder={3}>
        <sphereGeometry args={[1.005, 80, 80]} />
        <shaderMaterial
          blending={NormalBlending}
          transparent
          depthWrite={false}
          side={FrontSide}
          toneMapped
          uniforms={{
            sunDirection: { value: sunDirection },
            hazeColor: { value: hazeColor },
          }}
          vertexShader={`
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;

            void main() {
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `}
          fragmentShader={`
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;

            uniform vec3 sunDirection;
            uniform vec3 hazeColor;

            void main() {
              vec3 P = normalize(vWorldPos);
              vec3 V = normalize(cameraPosition - vWorldPos);
              vec3 L = normalize(sunDirection);

              float cosPv = clamp(dot(P, V), 0.0, 1.0);
              float mu = 1.0 - cosPv;
              float edgeWide = pow(mu, 1.85);
              float edgeTight = pow(mu, 3.8);
              float day = smoothstep(-0.08, 0.48, dot(P, L));

              vec3 hazeWide = hazeColor * edgeWide * (0.065 + day * 0.095);
              vec3 hazeTight = hazeColor * edgeTight * (0.1 + day * 0.082);
              vec3 innerRim = vec3(0.28, 0.36, 0.48) * (edgeWide * 0.1 + edgeTight * 0.19);
              vec3 nearAir = vec3(0.4, 0.52, 0.66) * (pow(mu, 1.2) * 0.054 + edgeTight * 0.095);
              vec3 rgb = hazeWide + hazeTight + innerRim + nearAir;
              float aColor = length(rgb) * 2.2;
              float aWide = pow(mu, 1.55) * (0.082 + day * 0.15);
              float aTight = pow(mu, 3.2) * (0.105 + day * 0.14);
              float a = clamp(aColor * 0.25 + aWide + aTight, 0.0, 0.45);
              gl_FragColor = vec4(rgb, a);
            }
          `}
        />
      </mesh>
    </>
  );
}
