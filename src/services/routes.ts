import { Coordinates, RouteMatrixElement } from "../types";
import { config } from "../utils/config";

const ROUTE_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

const FIELD_MASK =
  "originIndex,destinationIndex,duration,distanceMeters,status,condition";

interface RawMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string; // e.g. "1145s"
  distanceMeters?: number;
  status?: object;
  condition?: string;
}

function toWaypoint(c: Coordinates) {
  return {
    waypoint: {
      location: {
        latLng: { latitude: c.lat, longitude: c.lng },
      },
    },
  };
}

function parseDuration(raw: string | undefined): number {
  if (!raw) return 0;
  return parseInt(raw.replace(/s$/, ""), 10);
}

/**
 * Calls the Google Routes API Compute Route Matrix and returns drive-time
 * data for every origin → destination pair.
 *
 * Elements where no route exists (condition !== "ROUTE_EXISTS") are excluded.
 */
export async function getRouteMatrix(
  origins: Coordinates[],
  destinations: Coordinates[],
  travelMode: string = "DRIVE"
): Promise<RouteMatrixElement[]> {
  const body = {
    origins: origins.map(toWaypoint),
    destinations: destinations.map(toWaypoint),
    travelMode,
    routingPreference: "TRAFFIC_AWARE",
  };

  const response = await fetch(ROUTE_MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googleMapsApiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Routes API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as RawMatrixElement[];

  return data
    .filter((el) => el.condition === "ROUTE_EXISTS")
    .map((el) => ({
      originIndex: el.originIndex ?? 0,
      destinationIndex: el.destinationIndex ?? 0,
      durationSeconds: parseDuration(el.duration),
      distanceMeters: el.distanceMeters ?? 0,
    }));
}
