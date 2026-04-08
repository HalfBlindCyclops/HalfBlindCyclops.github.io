"use client";

import { useLayoutEffect, useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { latLonToSceneWorld } from "@/lib/geo";

/** Max angle (rad) off the framed “ideal” view while a section is open (~66° / ~50°). */
const WIGGLE_MAX_RAD_DESKTOP = 1.15;
const WIGGLE_MAX_RAD_MOBILE = 0.88;
/** Orbit speed while focused — closer to idle so the camera doesn’t feel glued. */
const ROTATE_SPEED_SECTION_LOCKED = 0.44;
const ROTATE_SPEED_IDLE = 0.52;
const DAMPING_SECTION_LOCKED = 0.09;
const DAMPING_IDLE = 0.085;
/** When outside the cone, ease back toward the boundary (lower = softer at the limit). */
const WIGGLE_CONE_BLEND_PER_SEC = 7;

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
  /** Desktop split layout: shift the projection center right only while a resume section is open. */
  applyDesktopViewOffset: boolean;
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
  const distance = isMobile ? 2.38 : 2.94;
  cameraPosition.copy(scratchDir).multiplyScalar(distance);
  cameraPosition.y += isMobile ? 0.24 : 0.3;
  // Positive camera X nudges the globe left on screen.
  cameraPosition.x += isMobile ? 0.12 : 0.24;
}

/** Idle / home return: farther from the globe, no lateral offset (centers with undistorted projection). */
function setIdleOverviewFraming(
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
  const distance = isMobile ? 3.22 : 4.08;
  cameraPosition.copy(scratchDir).multiplyScalar(distance);
  cameraPosition.y += isMobile ? 0.24 : 0.3;
}

export function CameraRig({
  latitude,
  longitude,
  homeLatitude,
  homeLongitude,
  mode,
  isMobile,
  reducedMotion,
  applyDesktopViewOffset,
  onFocusSettled,
  onReturnSettled,
}: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, size } = useThree();
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
  const clampIdealDir = useRef(new Vector3());
  const clampActualDir = useRef(new Vector3());
  const clampAxis = useRef(new Vector3());
  const wiggleDirSmoothedRef = useRef(new Vector3());

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
    setIdleOverviewFraming(
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

  useEffect(() => {
    const perspective = camera as typeof camera & {
      setViewOffset?: (
        fullWidth: number,
        fullHeight: number,
        x: number,
        y: number,
        width: number,
        height: number,
      ) => void;
      clearViewOffset?: () => void;
      updateProjectionMatrix: () => void;
    };

    if (
      isMobile ||
      !applyDesktopViewOffset ||
      !perspective.setViewOffset ||
      !perspective.clearViewOffset
    ) {
      perspective.clearViewOffset?.();
      perspective.updateProjectionMatrix();
      return;
    }

    // Off-center projection keeps the orbit focal point left of screen center
    // while preserving a full-bleed canvas (avoids clipping/sliced globe).
    const offsetX = Math.round(size.width * 0.195);
    perspective.setViewOffset(size.width, size.height, offsetX, 0, size.width, size.height);
    perspective.updateProjectionMatrix();
    return () => {
      perspective.clearViewOffset?.();
      perspective.updateProjectionMatrix();
    };
  }, [applyDesktopViewOffset, camera, isMobile, size.height, size.width]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    const t = target.current;
    const ft = focusTarget.current;
    const dfp = desiredFocusPosition.current;
    const td = tempDirection.current;
    const shouldFocus = latitude !== null && longitude !== null && mode !== "returning";

    syncHomeVectors();

    // Section open: no pan/zoom. Light orbit wiggle only once focus has settled ("focused").
    // During "focusing", camera still lerps to the framed pose; "returning" restores full orbit.
    const sectionFramed =
      latitude !== null &&
      longitude !== null &&
      (mode === "focusing" || mode === "focused");
    const canWiggle = mode === "focused" && latitude !== null && longitude !== null;
    // Orbit drag: off only while camera lerps to a new pin ("focusing"); idle / returning / focused all allow rotate.
    controls.enableRotate = !sectionFramed || canWiggle;
    controls.enablePan = !sectionFramed;
    controls.enableZoom = !sectionFramed;

    let desiredPosition: Vector3;

    if (shouldFocus) {
      setFramingForLatLon(latitude, longitude, isMobile, t, dfp, ft, td);
      // Show more context around the selected node by pulling camera slightly back.
      dfp.addScaledVector(td, isMobile ? 0.48 : 0.82);
      desiredPosition = dfp;
      if (!canWiggle) {
        const cameraLerpSpeed = reducedMotion ? 3.6 : 2.1;
        camera.position.lerp(desiredPosition, MathUtils.clamp(delta * cameraLerpSpeed, 0, 1));
      }
    } else if (mode === "returning") {
      t.copy(homeOrbitTarget.current);
      desiredPosition = homeCameraPos.current;
      camera.position.lerp(desiredPosition, MathUtils.clamp(delta * (reducedMotion ? 4 : 2.4), 0, 1));
    } else {
      t.copy(controls.target);
      desiredPosition = camera.position;
    }

    controls.target.lerp(t, MathUtils.clamp(delta * (reducedMotion ? 3.8 : 2.5), 0, 1));
    controls.autoRotate = mode === "idle";
    controls.autoRotateSpeed = reducedMotion ? 0.18 : 0.22;
    controls.update();

    if (canWiggle) {
      let maxWiggle = isMobile ? WIGGLE_MAX_RAD_MOBILE : WIGGLE_MAX_RAD_DESKTOP;
      if (reducedMotion) maxWiggle *= 0.65;

      // Pin wiggle around the framed orbit pivot; parallel transport of view direction from design target `t`.
      const desiredDist = dfp.distanceTo(t);
      const idealDir = clampIdealDir.current.copy(dfp).sub(t).normalize();
      const pivot = controls.target;
      const actualDir = clampActualDir.current.copy(camera.position).sub(pivot).normalize();

      let dot = idealDir.dot(actualDir);
      dot = Math.min(1, Math.max(-1, dot));
      const ang = Math.acos(dot);
      let outDir = actualDir;

      if (ang > maxWiggle) {
        const axis = clampAxis.current.crossVectors(idealDir, actualDir);
        if (axis.lengthSq() < 1e-12) {
          axis.set(1, 0, 0).cross(idealDir);
          if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0).cross(idealDir);
        }
        axis.normalize();
        outDir = clampIdealDir.current.clone().applyAxisAngle(axis, maxWiggle);
      }

      const wSm = wiggleDirSmoothedRef.current;
      if (wSm.lengthSq() < 1e-12) wSm.copy(actualDir);
      const coneBlend = Math.min(1, delta * WIGGLE_CONE_BLEND_PER_SEC * (reducedMotion ? 0.75 : 1));
      if (ang <= maxWiggle) {
        wSm.copy(outDir);
      } else {
        wSm.lerp(outDir, coneBlend).normalize();
      }
      camera.position.copy(pivot).addScaledVector(wSm, desiredDist);
      camera.lookAt(pivot);
    } else {
      wiggleDirSmoothedRef.current.set(0, 0, 0);
    }

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

  const sectionLocked = mode === "focused";

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan
      minDistance={isMobile ? 1.7 : 1.9}
      maxDistance={isMobile ? 22 : 28}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI - 0.12}
      enableDamping
      dampingFactor={sectionLocked ? DAMPING_SECTION_LOCKED : DAMPING_IDLE}
      rotateSpeed={sectionLocked ? ROTATE_SPEED_SECTION_LOCKED : ROTATE_SPEED_IDLE}
    />
  );
}
