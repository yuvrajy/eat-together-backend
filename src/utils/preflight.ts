import { config } from "./config";

interface CheckResult {
  ok: boolean;
  label: string;
  detail?: string;
}

/**
 * Probes the Places API (New) with a minimal Nearby Search request.
 * A 200 or 404 means the API is reachable and enabled.
 * A 403 SERVICE_DISABLED means the API is not enabled on the project.
 */
async function checkPlacesApi(): Promise<CheckResult> {
  const label = "Places API (New)";
  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": config.googleMapsApiKey,
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({
          includedTypes: ["restaurant"],
          maxResultCount: 1,
          locationRestriction: {
            circle: {
              center: { latitude: 37.404, longitude: -122.134 },
              radius: 500,
            },
          },
        }),
      }
    );

    if (res.ok) return { ok: true, label };

    const body = await res.json() as { error?: { status?: string; message?: string } };
    const status = body?.error?.status ?? "";
    const message = body?.error?.message ?? `HTTP ${res.status}`;

    if (status === "SERVICE_DISABLED") {
      return {
        ok: false,
        label,
        detail: `API not enabled on this project.\n    Enable it at: https://console.developers.google.com/apis/api/places.googleapis.com`,
      };
    }

    // Any other non-200 (e.g. INVALID_ARGUMENT) still means the API IS enabled
    return { ok: true, label, detail: `responded with ${res.status} (API is enabled)` };
  } catch (err) {
    return { ok: false, label, detail: `Network error: ${String(err)}` };
  }
}

/**
 * Probes the Routes API with a minimal Route Matrix request.
 * Same logic — 403 SERVICE_DISABLED = not enabled.
 */
async function checkRoutesApi(): Promise<CheckResult> {
  const label = "Routes API";
  try {
    const res = await fetch(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": config.googleMapsApiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration",
        },
        body: JSON.stringify({
          origins: [
            { waypoint: { location: { latLng: { latitude: 37.33, longitude: -122.03 } } } },
          ],
          destinations: [
            { waypoint: { location: { latLng: { latitude: 37.40, longitude: -122.13 } } } },
          ],
          travelMode: "DRIVE",
        }),
      }
    );

    if (res.ok) return { ok: true, label };

    const body = await res.json() as { error?: { status?: string; message?: string } };
    const status = body?.error?.status ?? "";

    if (status === "SERVICE_DISABLED") {
      return {
        ok: false,
        label,
        detail: `API not enabled on this project.\n    Enable it at: https://console.developers.google.com/apis/api/routes.googleapis.com`,
      };
    }

    return { ok: true, label, detail: `responded with ${res.status} (API is enabled)` };
  } catch (err) {
    return { ok: false, label, detail: `Network error: ${String(err)}` };
  }
}

/**
 * Runs both API checks in parallel. Logs results and throws if any fail,
 * so the server exits before accepting requests with a broken config.
 */
export async function runPreflight(): Promise<void> {
  console.log("Running API preflight checks...");

  const [places, routes] = await Promise.all([checkPlacesApi(), checkRoutesApi()]);

  let allOk = true;
  for (const result of [places, routes]) {
    if (result.ok) {
      console.log(`  ✓ ${result.label}${result.detail ? ` — ${result.detail}` : ""}`);
    } else {
      console.error(`  ✗ ${result.label} — ${result.detail ?? "unknown error"}`);
      allOk = false;
    }
  }

  if (!allOk) {
    throw new Error(
      "One or more required Google APIs are not enabled. Fix the above errors and restart."
    );
  }

  console.log("Preflight passed.\n");
}
