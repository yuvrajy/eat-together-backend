import {
  CandidateRestaurant,
  RouteMatrixElement,
  ScoredRestaurant,
  UserPreference,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

const PRICE_RANK: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function priceRank(level: string | undefined): number {
  return level !== undefined ? (PRICE_RANK[level] ?? 2) : 2;
}

/** Returns times + distances for one destination across all N origins, or null if any missing. */
function routesForDestination(
  matrix: RouteMatrixElement[],
  destinationIndex: number,
  userCount: number
): { times: number[]; distances: number[] } | null {
  const times: number[] = [];
  const distances: number[] = [];
  for (let o = 0; o < userCount; o++) {
    const el = matrix.find(
      (e) => e.originIndex === o && e.destinationIndex === destinationIndex
    );
    if (!el) return null;
    times.push(el.durationSeconds);
    distances.push(el.distanceMeters);
  }
  return { times, distances };
}

function buildScoredRestaurant(
  candidate: CandidateRestaurant,
  times: number[],
  distances: number[],
  fairnessScore: number
): ScoredRestaurant {
  return {
    ...candidate,
    travel_times_seconds: times,
    travel_distances_meters: distances,
    time_from_a_seconds: times[0] ?? 0,
    time_from_b_seconds: times[1] ?? 0,
    distance_from_a_meters: distances[0] ?? 0,
    distance_from_b_meters: distances[1] ?? 0,
    fairness_score: Math.round(fairnessScore * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Simple mode — N-user fairness score (lower = better)
// score = max(times) + 0.3 × stdDev(times)
// ---------------------------------------------------------------------------

export function scoreAndRank(
  candidates: CandidateRestaurant[],
  matrix: RouteMatrixElement[],
  topN: number
): ScoredRestaurant[] {
  const userCount = matrix.length > 0
    ? Math.max(...matrix.map((e) => e.originIndex)) + 1
    : 2;

  const scored: ScoredRestaurant[] = [];

  for (let d = 0; d < candidates.length; d++) {
    const routes = routesForDestination(matrix, d, userCount);
    if (!routes) continue;

    const { times, distances } = routes;
    const maxTime = Math.max(...times);
    const fairnessScore = maxTime + 0.3 * stdDev(times);

    scored.push(buildScoredRestaurant(candidates[d], times, distances, fairnessScore));
  }

  return scored
    .sort((a, b) => a.fairness_score - b.fairness_score)
    .slice(0, topN);
}

// ---------------------------------------------------------------------------
// Extra Fair mode — weighted multi-criteria utility scoring (higher = better)
// Dimensions: distance, cuisine (multi-select), price, vibe (niche/mainstream)
// Global score = mean(utilities) × (1 − 0.3 × stdDev(utilities))
// Converted to fairness_score: lower = better, for iOS display consistency.
// ---------------------------------------------------------------------------

export function scoreAndRankExtraFair(
  candidates: CandidateRestaurant[],
  matrix: RouteMatrixElement[],
  preferences: UserPreference[],
  topN: number
): ScoredRestaurant[] {
  const userCount = preferences.length;
  if (userCount === 0) return scoreAndRank(candidates, matrix, topN);

  // Max travel time per user across all candidates (for normalization)
  const maxTimePerUser: number[] = Array(userCount).fill(0);
  for (let d = 0; d < candidates.length; d++) {
    for (let o = 0; o < userCount; o++) {
      const el = matrix.find((e) => e.originIndex === o && e.destinationIndex === d);
      if (el && el.durationSeconds > maxTimePerUser[o]) {
        maxTimePerUser[o] = el.durationSeconds;
      }
    }
  }

  // Log-scale max review count for vibe normalization
  const maxReviews = Math.max(
    ...candidates.map((c) => c.user_rating_count ?? 0),
    1
  );

  const scored: ScoredRestaurant[] = [];

  for (let d = 0; d < candidates.length; d++) {
    const routes = routesForDestination(matrix, d, userCount);
    if (!routes) continue;

    const { times, distances } = routes;
    const c = candidates[d];
    const userUtilities: number[] = [];

    for (let u = 0; u < userCount; u++) {
      const pref = preferences[u];
      const w = preferenceWeights(pref.priorities);

      // Distance: closer = higher score
      const timeScore = maxTimePerUser[u] > 0
        ? 1 - times[u] / maxTimePerUser[u]
        : 1;

      // Cuisine: 1 if restaurant matches ANY of user's selected types, 0.5 if no pref
      const cuisineScore =
        pref.cuisineTypes && pref.cuisineTypes.length > 0
          ? pref.cuisineTypes.includes(c.primary_type ?? "") ? 1 : 0
          : 0.5;

      // Price: 1 if at or below max price, 0 if over, 0.5 if no pref
      const priceScore = pref.maxPrice
        ? priceRank(c.price_level) <= priceRank(pref.maxPrice) ? 1 : 0
        : 0.5;

      // Vibe: log-normalized review count
      const reviewCount = c.user_rating_count ?? 0;
      const logCount = Math.log1p(reviewCount);
      const logMax = Math.log1p(maxReviews);
      let vibeScore = 0.5;
      if (pref.vibe === "niche") vibeScore = 1 - logCount / logMax;
      else if (pref.vibe === "mainstream") vibeScore = logCount / logMax;

      const totalWeight = w.distance + w.cuisine + w.price + w.vibe;
      const utility =
        (w.distance * timeScore +
          w.cuisine * cuisineScore +
          w.price * priceScore +
          w.vibe * vibeScore) /
        totalWeight;

      userUtilities.push(utility);
    }

    const meanUtil = userUtilities.reduce((a, b) => a + b, 0) / userCount;
    const sdUtil = stdDev(userUtilities);
    const globalScore = meanUtil * (1 - 0.3 * sdUtil);

    // Convert to "lower = better" for consistent iOS display (fairness_score pts)
    const fairnessScore = Math.round((1 - globalScore) * 1000) / 10;

    scored.push(buildScoredRestaurant(c, times, distances, fairnessScore));
  }

  return scored
    .sort((a, b) => a.fairness_score - b.fairness_score)
    .slice(0, topN);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type PriorityKey = "distance" | "cuisine" | "price" | "vibe";

function preferenceWeights(
  priorities: PriorityKey[]
): Record<PriorityKey, number> {
  // Exponential weights so top priority strongly dominates
  // rank 0 → 2^N, rank 1 → 2^(N-1), ..., unranked → 1
  const weights: Record<PriorityKey, number> = {
    distance: 1,
    cuisine: 1,
    price: 1,
    vibe: 1,
  };
  const n = priorities.length;
  priorities.forEach((key, i) => {
    weights[key] = Math.pow(2, n - i);
  });
  return weights;
}
