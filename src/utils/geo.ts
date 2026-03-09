import { Coordinates } from "../types";

const EARTH_RADIUS_METERS = 6_371_000;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Returns the great-circle distance in meters between two WGS 84 coordinates
 * using the Haversine formula.
 */
export function haversineDistance(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Returns the arithmetic midpoint of two coordinates.
 * Accurate enough for same-city distances (< ~100 km apart).
 */
export function midpoint(a: Coordinates, b: Coordinates): Coordinates {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

/**
 * Returns the search radius to use around the midpoint.
 * = 20% of user-to-user distance, clamped to [1 000 m, 50 000 m].
 */
export function computeSearchRadius(a: Coordinates, b: Coordinates): number {
  const distanceMeters = haversineDistance(a, b);
  return Math.min(Math.max(distanceMeters * 0.2, 1000), 50000);
}
