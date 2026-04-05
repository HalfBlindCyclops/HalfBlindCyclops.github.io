"use client";

import { useLayoutEffect, useEffect, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { latLonToSceneWorld } from "@/lib/geo";

type SceneMode = "idle" | "focusing" | "focused" | "returning";

type CameraRigProps = {
  latitude: number | null;
  longitude: number | null;
  /** Framing when idle and when returning from a focused node (e.g. primary Boston pin). */
  homeLatitude: number;
  homeLongitude: number;
  mode: SceneMode;
  isMobile: boolean;
  reducedMotion: boolean;
  onFocusSettled: () => void;
  onReturnSettled: () => void;
};

function setFramingForLatLon(
  lat: number,
  lon: number,
  isMobile: boolean,
  orbitTarget: Vector3,
  cameraPosition: Vector3,
  scratchFocus: Vector3,
  scratchDir: Vector3,
) {
  scratchFocus.copy(latLonToSceneWorld(lat, lon, 1.03));
  orbitTarget.copy(scratchFocus).addScaledVector(scratchFocus, isMobile ? 0.02 : 0.03);
  scratchDir.copy(scratchFocus).normalize();
  const distance = isMobile ? 2.0 : 2.35;
  cameraPosition.copy(scratchDir).multiplyScalar(distance);
  cameraPosition.y += isMobile ? 0.24 : 0.3;
  cameraPosition.x += isMobile ? 0.02 : 0.06;
}

export function CameraRig({
  latitude,
  longitude,
  homeLatitude,
  homeLongitude,
  mode,
  isMobile,
  reducedMotion,
  onFocusSettled,
  onReturnSettled,
}: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const target = useRef(new Vector3());
  const focusTarget = useRef(new Vector3());
  const desiredFocusPosition = useRef(new Vector3());
  const tempDirection = useRef(new Vector3());
  const scratchFocus = useRef(new Vector3());
  const homeOrbitTarget = useRef(new Vector3());
  const homeCameraPos = useRef(new Vector3());
  const focusNotifiedRef = useRef(false);
  const returnNotifiedRef = useRef(false);
  const prevModeRef = useRef<SceneMode>(mode);

  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (mode === "focusing" && prev !== "focusing") {
      focusNotifiedRef.current = false;
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "focusing") {
      focusNotifiedRef.current = false;
    }
  }, [latitude, longitude, mode]);

  const syncHomeVectors = () => {
    setFramingForLatLon(
      homeLatitude,
      homeLongitude,
      isMobile,
      homeOrbitTarget.current,
      homeCameraPos.current,
      scratchFocus.current,
      tempDirection.current,
    );
  };

  useLayoutEffect(() => {
    syncHomeVectors();
    camera.position.copy(homeCameraPos.current);
    const c = controlsRef.current;
    if (c) {
      c.target.copy(homeOrbitTarget.current);
      c.update();
    }
  }, [camera, homeLatitude, homeLongitude, isMobile, reducedMotion]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    const t = target.current;
    const ft = focusTarget.current;
    const dfp = desiredFocusPosition.current;
    const td = tempDirection.current;
    const sf = scratchFocus.current;
    const shouldFocus = latitude !== null && longitude !== null && mode !== "returning";

    syncHomeVectors();

    const orbitLocked =
      latitude !== null && longitude !== null && mode !== "idle";
    controls.enableRotate = !orbitLocked;
    controls.enablePan = !orbitLocked;
    controls.enableZoom = !orbitLocked;

    let desiredPosition: Vector3;

    if (shouldFocus) {
      setFramingForLatLon(latitude, longitude, isMobile, t, dfp, ft, td);
      desiredPosition = dfp;
      const cameraLerpSpeed = reducedMotion ? 4.2 : 2.9;
      camera.position.lerp(desiredPosition, MathUtils.clamp(delta * cameraLerpSpeed, 0, 1));
    } else if (mode === "returning") {
      t.copy(homeOrbitTarget.current);
      desiredPosition = homeCameraPos.current;
      camera.position.lerp(desiredPosition, MathUtils.clamp(delta * (reducedMotion ? 4 : 2.4), 0, 1));
    } else {
      t.copy(controls.target);
      desiredPosition = camera.position;
    }

    controls.target.lerp(t, MathUtils.clamp(delta * (reducedMotion ? 4.5 : 3.2), 0, 1));
    controls.autoRotate = mode === "idle";
    controls.autoRotateSpeed = reducedMotion ? 0.18 : 0.22;
    controls.update();

    const closeToTarget = controls.target.distanceTo(t) < 0.025;
    const closeToCamera = camera.position.distanceTo(desiredPosition) < 0.09;

    if (mode === "focusing") {
      returnNotifiedRef.current = false;
    }
    if (mode === "returning") {
      focusNotifiedRef.current = false;
    }

    if (mode === "focusing" && closeToTarget && closeToCamera && !focusNotifiedRef.current) {
      focusNotifiedRef.current = true;
      onFocusSettled();
    }

    if (mode === "returning" && closeToTarget && closeToCamera && !returnNotifiedRef.current) {
      returnNotifiedRef.current = true;
      onReturnSettled();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan
      minDistance={isMobile ? 1.7 : 1.9}
      maxDistance={isMobile ? 22 : 28}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI - 0.12}
      enableDamping
      dampingFactor={0.085}
      rotateSpeed={0.52}
    />
  );
}
