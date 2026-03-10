import { Request, Response, Router } from "express";
import { findNearbyRestaurants } from "../services/places";
import { getRouteMatrix } from "../services/routes";
import { scoreAndRank, scoreAndRankExtraFair } from "../services/scoring";
import { Coordinates, SuggestRequest, SuggestResponse, UserPreference } from "../types";
import { computeSearchRadius, midpoint } from "../utils/geo";

const router = Router();

function isValidCoords(obj: unknown): obj is Coordinates {
  if (typeof obj !== "object" || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c["lat"] === "number" &&
    typeof c["lng"] === "number" &&
    c["lat"] >= -90 &&
    c["lat"] <= 90 &&
    c["lng"] >= -180 &&
    c["lng"] <= 180
  );
}

function centroid(coords: Coordinates[]): Coordinates {
  return {
    lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
  };
}

function maxPairwiseRadius(users: Coordinates[]): number {
  let max = 0;
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const r = computeSearchRadius(users[i], users[j]);
      if (r > max) max = r;
    }
  }
  return max;
}

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<SuggestRequest> & { user_a?: Coordinates; user_b?: Coordinates };

  // Support both legacy {user_a, user_b} and new {users: [...]}
  let users: Coordinates[];
  if (Array.isArray(body.users) && body.users.length >= 2) {
    users = body.users;
    if (!users.every(isValidCoords)) {
      res.status(400).json({ error: "All entries in users[] must have numeric lat and lng." });
      return;
    }
  } else if (isValidCoords(body.user_a) && isValidCoords(body.user_b)) {
    users = [body.user_a, body.user_b];
  } else {
    res.status(400).json({
      error: "Request body must include users[] (2+ entries) or user_a and user_b, each with numeric lat and lng.",
    });
    return;
  }

  const travelMode = body.travel_mode ?? "DRIVE";
  const mode = body.mode ?? "simple";
  const cuisineTypes = body.cuisine_types;
  const preferences: UserPreference[] = body.preferences ?? [];

  try {
    const mid = users.length === 2 ? midpoint(users[0], users[1]) : centroid(users);
    let radius = users.length === 2
      ? computeSearchRadius(users[0], users[1])
      : maxPairwiseRadius(users);

    let candidates = await findNearbyRestaurants(mid, radius, cuisineTypes);

    if (candidates.length === 0) {
      radius = Math.min(radius * 1.5, 50_000);
      candidates = await findNearbyRestaurants(mid, radius, cuisineTypes);
    }

    if (candidates.length === 0) {
      res.status(404).json({ error: "No restaurants found near the midpoint. Try different coordinates." });
      return;
    }

    const restaurantCoords = candidates.map((c) => c.location);
    const matrix = await getRouteMatrix(users, restaurantCoords, travelMode);

    // Return up to 10 for the swipe phase; final top 3 chosen after swiping on the client
    const results =
      mode === "extraFair" && preferences.length === users.length
        ? scoreAndRankExtraFair(candidates, matrix, preferences, 10)
        : scoreAndRank(candidates, matrix, 10);

    if (results.length === 0) {
      res.status(404).json({ error: "Could not calculate routes to any nearby restaurants. Try different coordinates." });
      return;
    }

    const response: SuggestResponse = { midpoint: mid, search_radius_meters: radius, mode, results };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in /api/suggest:", message);
    res.status(502).json({ error: `Upstream API error: ${message}` });
  }
});

export default router;
