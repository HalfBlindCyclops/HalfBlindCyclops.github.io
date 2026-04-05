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
