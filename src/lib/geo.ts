import { Vector3 } from "three";

/**
 * Radians; must match the earth `<group rotation={[0, …, 0]}>` in `GlobeExperience`.
 * Use `0` so lat/lon markers sit on the texture. Use `Math.PI` only if your equirect set needs a 180° Y twist for lighting.
 */
export const GLOBE_GROUP_Y_ROTATION = 0;
// Texture alignment offset so geographic longitudes match this Earth map orientation.
// Blue Marble in this project is currently shifted relative to geometric prime meridian.
export const LONGITUDE_ALIGNMENT_OFFSET_DEG = -34;

export function latLonToVector3(
  latitude: number,
  longitude: number,
  radius = 1,
): Vector3 {
  const lat = (latitude * Math.PI) / 180;
  const lon = ((longitude + LONGITUDE_ALIGNMENT_OFFSET_DEG) * Math.PI) / 180;

  const x = -radius * Math.cos(lat) * Math.cos(lon);
  const y = radius * Math.sin(lat);
  // Negate Z so negative longitudes map to the western hemisphere on this texture set.
  const z = -radius * Math.cos(lat) * Math.sin(lon);

  return new Vector3(x, y, z);
}

/** World-space point on the globe after the scene’s earth group Y-rotation (markers use local `latLonToVector3` inside that group). */
export function latLonToSceneWorld(
  latitude: number,
  longitude: number,
  radius = 1,
): Vector3 {
  const p = latLonToVector3(latitude, longitude, radius);
  const c = Math.cos(GLOBE_GROUP_Y_ROTATION);
  const s = Math.sin(GLOBE_GROUP_Y_ROTATION);
  return new Vector3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

/** Direction *toward the sun* in **local** globe space (before `GLOBE_GROUP_Y_ROTATION`). */
export function sunDirectionForDayAt(
  latitude: number,
  longitude: number,
): [number, number, number] {
  const v = latLonToVector3(latitude, longitude, 1);
  v.normalize();
  return [v.x, v.y, v.z];
}

/** Toward-sun unit vector in **scene world** space (matches rotated globe normals in shaders). */
export function sunDirectionInSceneWorld(
  latitude: number,
  longitude: number,
): [number, number, number] {
  const v = latLonToSceneWorld(latitude, longitude, 1);
  v.normalize();
  return [v.x, v.y, v.z];
}

/**
 * Toward-sun unit vector so the day/night terminator passes through (`latitudeDeg`, `longitudeDeg`)
 * (sun on the horizon there). `preferDayToward` picks the half-sphere that stays sunlit when ambiguous.
 */
export function sunDirectionForSunsetAt(
  latitudeDeg: number,
  longitudeDeg: number,
  preferDayToward?: { latitude: number; longitude: number },
): [number, number, number] {
  const n = latLonToSceneWorld(latitudeDeg, longitudeDeg, 1);
  n.normalize();
  const aux = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const L = new Vector3().crossVectors(n, aux);
  if (L.lengthSq() < 1e-12) {
    L.crossVectors(n, new Vector3(0, 0, 1));
  }
  L.normalize();
  if (preferDayToward) {
    const h = latLonToSceneWorld(
      preferDayToward.latitude,
      preferDayToward.longitude,
      1,
    ).normalize();
    if (L.dot(h) < 0) L.negate();
  }
  return [L.x, L.y, L.z];
}

function normalizeDegrees360(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function normalizeLongitude180(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/**
 * Approximate subsolar point (lat/lon where sun is directly overhead) for a UTC date.
 * This is sufficient for real-time visual day/night shading on the globe.
 */
export function subsolarPointAt(date: Date): { latitude: number; longitude: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  const meanLongitude = normalizeDegrees360(280.460 + 0.9856474 * n);
  const meanAnomaly = normalizeDegrees360(357.528 + 0.9856003 * n);
  const meanAnomalyRad = (meanAnomaly * Math.PI) / 180;

  const eclipticLongitude =
    meanLongitude +
    1.915 * Math.sin(meanAnomalyRad) +
    0.02 * Math.sin(2 * meanAnomalyRad);
  const eclipticLongitudeRad = (eclipticLongitude * Math.PI) / 180;
  const obliquityRad = ((23.439 - 0.0000004 * n) * Math.PI) / 180;

  const rightAscensionRad = Math.atan2(
    Math.cos(obliquityRad) * Math.sin(eclipticLongitudeRad),
    Math.cos(eclipticLongitudeRad),
  );
  const declinationRad = Math.asin(Math.sin(obliquityRad) * Math.sin(eclipticLongitudeRad));

  const rightAscensionDeg = normalizeDegrees360((rightAscensionRad * 180) / Math.PI);
  const declinationDeg = (declinationRad * 180) / Math.PI;
  const gmstDeg = normalizeDegrees360(280.46061837 + 360.98564736629 * n);

  const subsolarLongitudeDeg = normalizeLongitude180(rightAscensionDeg - gmstDeg);

  return {
    latitude: declinationDeg,
    longitude: subsolarLongitudeDeg,
  };
}

/**
 * Toward-sun direction in scene world space for the provided UTC date/time.
 */
export function sunDirectionForDate(date: Date): [number, number, number] {
  const subsolar = subsolarPointAt(date);
  return sunDirectionInSceneWorld(subsolar.latitude, subsolar.longitude);
}
