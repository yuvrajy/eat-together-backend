import { Request, Response, Router } from "express";
import { findNearbyRestaurants } from "../services/places";
import { getRouteMatrix } from "../services/routes";
import { scoreAndRank } from "../services/scoring";
import { SuggestRequest, SuggestResponse } from "../types";
import { computeSearchRadius, midpoint } from "../utils/geo";

const router = Router();

function isValidCoords(obj: unknown): obj is { lat: number; lng: number } {
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

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<SuggestRequest>;

  if (!isValidCoords(body.user_a) || !isValidCoords(body.user_b)) {
    res.status(400).json({
      error:
        "Request body must include user_a and user_b, each with numeric lat and lng.",
    });
    return;
  }

  const { user_a, user_b } = body;
  const travelMode = body.travel_mode ?? "DRIVE";
  const cuisineTypes = body.cuisine_types;

  try {
    const mid = midpoint(user_a, user_b);
    let radius = computeSearchRadius(user_a, user_b);

    // First attempt
    let candidates = await findNearbyRestaurants(mid, radius, cuisineTypes);

    // Retry with 1.5× radius if no results found
    if (candidates.length === 0) {
      radius = Math.min(radius * 1.5, 50_000);
      candidates = await findNearbyRestaurants(mid, radius, cuisineTypes);
    }

    if (candidates.length === 0) {
      res.status(404).json({
        error:
          "No restaurants found near the midpoint. Try different coordinates.",
      });
      return;
    }

    const restaurantCoords = candidates.map((c) => c.location);
    const matrix = await getRouteMatrix(
      [user_a, user_b],
      restaurantCoords,
      travelMode
    );

    const results = scoreAndRank(candidates, matrix, 3);

    if (results.length === 0) {
      res.status(404).json({
        error:
          "Could not calculate routes to any nearby restaurants. Try different coordinates.",
      });
      return;
    }

    const response: SuggestResponse = {
      midpoint: mid,
      search_radius_meters: radius,
      results,
    };

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in /api/suggest:", message);
    res.status(502).json({ error: `Upstream API error: ${message}` });
  }
});

export default router;
