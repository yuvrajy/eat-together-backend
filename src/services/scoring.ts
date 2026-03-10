import {
  CandidateRestaurant,
  RouteMatrixElement,
  ScoredRestaurant,
  UserPreference,
} from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PriorityKey = "distance" | "cuisine" | "price" | "vibe";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRICE_RANK: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Hard-cap travel times (seconds) per mode — absolute distance score decays linearly to 0
const DIST_HARD_CAP: Record<string, number> = {
  DRIVE: 3600,    // 60 min
  WALK: 1800,     // 30 min
  BICYCLE: 2400,  // 40 min
  TRANSIT: 3600,  // 60 min
};

// ---------------------------------------------------------------------------
// Cuisine family taxonomy for graded partial-credit matching
// ---------------------------------------------------------------------------

interface CuisineTaxonomy { family: string; region: string }

const CUISINE_MAP: Record<string, CuisineTaxonomy> = {
  italian_restaurant:       { family: "italian",        region: "european"       },
  pizza_restaurant:         { family: "italian",        region: "european"       },
  french_restaurant:        { family: "french",         region: "european"       },
  spanish_restaurant:       { family: "spanish",        region: "european"       },
  portuguese_restaurant:    { family: "portuguese",     region: "european"       },
  greek_restaurant:         { family: "greek",          region: "mediterranean"  },
  mediterranean_restaurant: { family: "mediterranean",  region: "mediterranean"  },
  middle_eastern_restaurant:{ family: "middle_eastern", region: "mediterranean"  },
  turkish_restaurant:       { family: "turkish",        region: "mediterranean"  },
  sushi_restaurant:         { family: "japanese",       region: "asian"          },
  japanese_restaurant:      { family: "japanese",       region: "asian"          },
  ramen_restaurant:         { family: "japanese",       region: "asian"          },
  chinese_restaurant:       { family: "chinese",        region: "asian"          },
  dim_sum_restaurant:       { family: "chinese",        region: "asian"          },
  thai_restaurant:          { family: "thai",           region: "asian"          },
  korean_restaurant:        { family: "korean",         region: "asian"          },
  vietnamese_restaurant:    { family: "vietnamese",     region: "asian"          },
  asian_restaurant:         { family: "asian",          region: "asian"          },
  indian_restaurant:        { family: "indian",         region: "south_asian"    },
  pakistani_restaurant:     { family: "pakistani",      region: "south_asian"    },
  mexican_restaurant:       { family: "mexican",        region: "latin"          },
  latin_american_restaurant:{ family: "latin_american", region: "latin"          },
  brazilian_restaurant:     { family: "brazilian",      region: "latin"          },
  hamburger_restaurant:     { family: "american",       region: "american"       },
  american_restaurant:      { family: "american",       region: "american"       },
  barbecue_restaurant:      { family: "american",       region: "american"       },
  sandwich_shop:            { family: "american",       region: "american"       },
};

/**
 * Graded cuisine match: exact=1.0, same family=0.85, same region=0.55, none=0.0
 * Returns the best match across all user-preferred types.
 */
function gradedCuisineScore(
  restaurantType: string | undefined,
  userCuisines: string[]
): number {
  if (!restaurantType || userCuisines.length === 0) return 0;
  return userCuisines.reduce((best, userType) => {
    if (userType === restaurantType) return Math.max(best, 1.0);
    const rTax = CUISINE_MAP[restaurantType];
    const uTax = CUISINE_MAP[userType];
    if (!rTax || !uTax) return best;
    if (rTax.family === uTax.family) return Math.max(best, 0.85);
    if (rTax.region === uTax.region) return Math.max(best, 0.55);
    return best;
  }, 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function priceRankVal(level: string | undefined): number {
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
// Scoring primitives
// ---------------------------------------------------------------------------

/** Absolute distance score: linear decay from 1 at t=0 to 0 at hard cap. */
function absoluteDistScore(t: number, travelMode: string): number {
  const cap = DIST_HARD_CAP[travelMode] ?? DIST_HARD_CAP.DRIVE;
  return Math.max(0.001, 1 - t / cap);
}

/**
 * Soft exponential price penalty.
 * diff > 0 means restaurant is more expensive than user's max.
 * exp(-0.75×diff): diff=1 → 0.47, diff=2 → 0.22, diff=3 → 0.10
 */
function softPriceScore(restaurantLevel: string | undefined, maxPriceLevel: string): number {
  const diff = priceRankVal(restaurantLevel) - priceRankVal(maxPriceLevel);
  return diff <= 0 ? 1.0 : Math.exp(-0.75 * diff);
}

/** Nash Social Welfare: geometric mean of per-user utilities. */
function nashWelfare(utilities: number[]): number {
  if (utilities.length === 0) return 0;
  const product = utilities.reduce((p, u) => p * Math.max(u, 0.001), 1);
  return Math.pow(product, 1 / utilities.length);
}

// ---------------------------------------------------------------------------
// ROC Weights
// ---------------------------------------------------------------------------

/**
 * Rank Order Centroid weights for ordered priority list restricted to active criteria.
 * w_k = (1/N) × Σ_{i=k+1}^{N} 1/i   (0-indexed rank k, N = total active criteria)
 * Unranked-but-active criteria share the lowest ROC weight slots equally.
 */
function computeROCWeights(
  priorities: PriorityKey[],
  activeCriteria: Set<PriorityKey>
): Record<PriorityKey, number> {
  const rankedActive = priorities.filter((p) => activeCriteria.has(p));
  const unrankedActive = ([...activeCriteria] as PriorityKey[]).filter(
    (k) => !priorities.includes(k)
  );
  const ordered = [...rankedActive, ...unrankedActive];
  const N = ordered.length;

  const weights: Record<PriorityKey, number> = { distance: 0, cuisine: 0, price: 0, vibe: 0 };
  if (N === 0) return weights;

  ordered.forEach((key, k) => {
    let sum = 0;
    for (let i = k + 1; i <= N; i++) sum += 1 / i;
    weights[key] = sum / N;
  });
  return weights;
}

// ---------------------------------------------------------------------------
// Pareto filter
// ---------------------------------------------------------------------------

/**
 * Returns indices (into candidateData) of non-dominated candidates.
 * Candidate A dominates B if every user utility of A ≥ B, and at least one strictly >.
 */
function paretoFilter(candidateData: { utilities: number[] }[]): Set<number> {
  const dominated = new Set<number>();
  for (let i = 0; i < candidateData.length; i++) {
    if (dominated.has(i)) continue;
    for (let j = 0; j < candidateData.length; j++) {
      if (i === j || dominated.has(j)) continue;
      const a = candidateData[i].utilities;
      const b = candidateData[j].utilities;
      if (a.every((u, idx) => u >= b[idx]) && a.some((u, idx) => u > b[idx])) {
        dominated.add(j);
      }
    }
  }
  const survivors = new Set<number>();
  for (let i = 0; i < candidateData.length; i++) {
    if (!dominated.has(i)) survivors.add(i);
  }
  return survivors;
}

// ---------------------------------------------------------------------------
// Simple mode — absolute distance → Nash welfare (lower fairness_score = better)
// ---------------------------------------------------------------------------

export function scoreAndRank(
  candidates: CandidateRestaurant[],
  matrix: RouteMatrixElement[],
  topN: number,
  travelMode: string = "DRIVE"
): ScoredRestaurant[] {
  const userCount =
    matrix.length > 0 ? Math.max(...matrix.map((e) => e.originIndex)) + 1 : 2;

  const scored: ScoredRestaurant[] = [];

  for (let d = 0; d < candidates.length; d++) {
    const routes = routesForDestination(matrix, d, userCount);
    if (!routes) continue;

    const { times, distances } = routes;
    const utilities = times.map((t) => absoluteDistScore(t, travelMode));
    const groupScore = nashWelfare(utilities);
    const fairnessScore = Math.round((1 - groupScore) * 1000) / 10;

    scored.push(buildScoredRestaurant(candidates[d], times, distances, fairnessScore));
  }

  return scored.sort((a, b) => a.fairness_score - b.fairness_score).slice(0, topN);
}

// ---------------------------------------------------------------------------
// Extra Fair mode — ROC weights, graded cuisine, soft price, percentile vibe,
//                   hybrid distance, Nash welfare, Pareto filter, utility floor
// ---------------------------------------------------------------------------

export function scoreAndRankExtraFair(
  candidates: CandidateRestaurant[],
  matrix: RouteMatrixElement[],
  preferences: UserPreference[],
  topN: number,
  travelMode: string = "DRIVE",
  allTogether: boolean = false
): ScoredRestaurant[] {
  const userCount = preferences.length;
  if (userCount === 0) return scoreAndRank(candidates, matrix, topN, travelMode);

  // Per-user max travel time across all candidates (for relative distance component)
  const maxTimePerUser: number[] = Array(userCount).fill(0);
  for (let d = 0; d < candidates.length; d++) {
    for (let o = 0; o < userCount; o++) {
      const el = matrix.find((e) => e.originIndex === o && e.destinationIndex === d);
      if (el && el.durationSeconds > maxTimePerUser[o]) {
        maxTimePerUser[o] = el.durationSeconds;
      }
    }
  }

  // Review-count percentile for vibe scoring (0 = least reviewed, 1 = most reviewed)
  const reviewCounts = candidates.map((c) => c.user_rating_count ?? 0);
  const sorted = [...reviewCounts].sort((a, b) => a - b);
  const reviewPercentile = candidates.map((c) => {
    const count = c.user_rating_count ?? 0;
    const rank = sorted.indexOf(count);
    return candidates.length > 1 ? rank / (candidates.length - 1) : 0.5;
  });

  // Per-user active criteria and ROC weights
  const userActiveCriteria: Set<PriorityKey>[] = preferences.map((pref) => {
    const active = new Set<PriorityKey>();
    if (!allTogether) active.add("distance");
    if (pref.cuisineTypes && pref.cuisineTypes.length > 0) active.add("cuisine");
    if (pref.maxPrice) active.add("price");
    if (pref.vibe && pref.vibe !== "any") active.add("vibe");
    return active;
  });

  const userWeights = preferences.map((pref, u) =>
    computeROCWeights(pref.priorities, userActiveCriteria[u])
  );

  // Compute per-candidate per-user utilities
  const candidateData: { utilities: number[]; times: number[]; distances: number[] }[] = [];

  for (let d = 0; d < candidates.length; d++) {
    const routes = routesForDestination(matrix, d, userCount);
    if (!routes) continue;

    const { times, distances } = routes;
    const c = candidates[d];
    const pct = reviewPercentile[d];
    const userUtilities: number[] = [];

    for (let u = 0; u < userCount; u++) {
      const pref = preferences[u];
      const w = userWeights[u];
      const active = userActiveCriteria[u];
      let utility = 0;
      let totalWeight = 0;

      if (active.has("distance")) {
        const absScore = absoluteDistScore(times[u], travelMode);
        const relScore = maxTimePerUser[u] > 0 ? 1 - times[u] / maxTimePerUser[u] : 1;
        const distScore = 0.7 * absScore + 0.3 * relScore;
        utility += w.distance * distScore;
        totalWeight += w.distance;
      }

      if (active.has("cuisine") && pref.cuisineTypes) {
        const cs = gradedCuisineScore(c.primary_type, pref.cuisineTypes);
        utility += w.cuisine * cs;
        totalWeight += w.cuisine;
      }

      if (active.has("price") && pref.maxPrice) {
        const ps = softPriceScore(c.price_level, pref.maxPrice);
        utility += w.price * ps;
        totalWeight += w.price;
      }

      if (active.has("vibe") && pref.vibe && pref.vibe !== "any") {
        const vs = pref.vibe === "mainstream" ? pct : 1 - pct;
        utility += w.vibe * vs;
        totalWeight += w.vibe;
      }

      userUtilities.push(totalWeight > 0 ? utility / totalWeight : 0.5);
    }

    candidateData.push({ utilities: userUtilities, times, distances });
  }

  // Pareto filter — only when we have ample candidates to prune
  const survivorSet =
    candidateData.length > 2 * topN
      ? paretoFilter(candidateData)
      : new Set(candidateData.map((_, i) => i));

  // Score survivors with Nash welfare + two-tier utility floor
  const VETO_HARD = 0.05;
  const VETO_SOFT = 0.25;
  const scored: ScoredRestaurant[] = [];

  // Map candidateData indices back to original candidates array
  let dataIdx = 0;
  for (let d = 0; d < candidates.length; d++) {
    const routes = routesForDestination(matrix, d, userCount);
    if (!routes) continue;

    const ci = dataIdx++;
    if (!survivorSet.has(ci)) continue;

    const { utilities, times, distances } = candidateData[ci];
    const minUtil = Math.min(...utilities);

    let groupScore = nashWelfare(utilities);
    if (minUtil < VETO_HARD && candidateData.length > 5) {
      groupScore *= 0.1;
    } else if (minUtil < VETO_SOFT) {
      groupScore *= minUtil / VETO_SOFT;
    }

    const fairnessScore = Math.round((1 - groupScore) * 1000) / 10;
    scored.push(buildScoredRestaurant(candidates[d], times, distances, fairnessScore));
  }

  return scored.sort((a, b) => a.fairness_score - b.fairness_score).slice(0, topN);
}
