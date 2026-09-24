/** Small, dependency-free geodesy. Accurate to well under a metre at walking distances. */

const R = 6_371_008.8; // mean earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point `meters` away from `from` along `bearingDeg` (0 = north, clockwise). */
export function destination(from: LatLng, meters: number, bearingDeg: number): LatLng {
  const δ = meters / R;
  const θ = rad(bearingDeg);
  const φ1 = rad(from.lat);
  const λ1 = rad(from.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: deg(φ2), lng: ((deg(λ2) + 540) % 360) - 180 };
}

/**
 * A stable grid cell key of roughly `sizeM` metres. Used for heat maps and per-square
 * limits: we store the cell, never the exact point, for anything that outlives a session.
 */
export function cellKey(p: LatLng, sizeM: number): string {
  const latStep = sizeM / 111_320;
  const row = Math.floor(p.lat / latStep);
  const lngStep = sizeM / (111_320 * Math.max(0.01, Math.cos(rad((row + 0.5) * latStep))));
  const col = Math.floor(p.lng / lngStep);
  return `${sizeM}:${row}:${col}`;
}

export function cellCenter(key: string): LatLng {
  const [size, row, col] = key.split(":").map(Number);
  const latStep = size / 111_320;
  const lat = (row + 0.5) * latStep;
  const lngStep = size / (111_320 * Math.max(0.01, Math.cos(rad(lat))));
  return { lat, lng: (col + 0.5) * lngStep };
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Minutes on foot at 1.35 m/s, never less than one. */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 1.35 / 60));
}
