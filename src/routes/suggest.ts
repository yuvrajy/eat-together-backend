import { Request, Response, Router } from "express";
import { findNearbyRestaurants } from "../services/places";
import { getRouteMatrix } from "../services/routes";
import { scoreAndRank, scoreAndRankExtraFair } from "../services/scoring";
import { CandidateRestaurant, Coordinates, SuggestRequest, SuggestResponse, UserPreference } from "../types";
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
  const maxPrice: string | undefined = body.max_price;
  const preferences: UserPreference[] = body.preferences ?? [];

  const PRICE_RANK: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };

  // For extraFair mode: one Places API call per user's cuisine set, merged+deduped
  async function fetchCandidates(
    mid: Coordinates,
    radius: number,
    mode: string,
    cuisineTypes: string[] | undefined,
    preferences: UserPreference[]
  ): Promise<CandidateRestaurant[]> {
    if (mode === "extraFair" && preferences.length > 0) {
      // Build list of cuisine groups: one per user + one generic fallback
      const groups: (string[] | undefined)[] = preferences.map((p) =>
        p.cuisineTypes && p.cuisineTypes.length > 0 ? p.cuisineTypes : undefined
      );
      groups.push(undefined); // generic restaurant search always included

      const batches = await Promise.all(
        groups.map((types) => findNearbyRestaurants(mid, radius, types))
      );

      const map = new Map<string, CandidateRestaurant>();
      for (const batch of batches) {
        for (const r of batch) {
          if (!map.has(r.place_id)) map.set(r.place_id, r);
        }
      }
      return Array.from(map.values());
    }

    return findNearbyRestaurants(mid, radius, cuisineTypes);
  }

  try {
    const mid = users.length === 2 ? midpoint(users[0], users[1]) : centroid(users);
    let radius = users.length === 2
      ? computeSearchRadius(users[0], users[1])
      : maxPairwiseRadius(users);

    let candidates = await fetchCandidates(mid, radius, mode, cuisineTypes, preferences);

    if (candidates.length === 0) {
      radius = Math.min(radius * 1.5, 50_000);
      candidates = await fetchCandidates(mid, radius, mode, cuisineTypes, preferences);
    }

    if (candidates.length === 0) {
      res.status(404).json({ error: "No restaurants found near the midpoint. Try different coordinates." });
      return;
    }

    // Hard price filter for simple mode
    if (mode === "simple" && maxPrice && PRICE_RANK[maxPrice] !== undefined) {
      const limit = PRICE_RANK[maxPrice];
      const filtered = candidates.filter(
        (c) => c.price_level === undefined || (PRICE_RANK[c.price_level] ?? 2) <= limit
      );
      // Only apply filter if it leaves at least 3 candidates
      if (filtered.length >= 3) candidates = filtered;
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
