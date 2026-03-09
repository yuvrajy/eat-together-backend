import {
  CandidateRestaurant,
  RouteMatrixElement,
  ScoredRestaurant,
} from "../types";

/**
 * Scores and ranks candidate restaurants by fairness.
 *
 * Fairness score (lower = better):
 *   max_time + 0.3 * abs(time_a - time_b)
 *
 * The primary term minimises the longest drive either person makes.
 * The secondary term (weight 0.3) breaks ties by preferring equal commutes.
 *
 * Restaurants for which a route doesn't exist from either user are excluded.
 *
 * @param candidates - ordered list of restaurants (index == destinationIndex)
 * @param matrix     - flat list from the Route Matrix API
 * @param topN       - how many to return
 */
export function scoreAndRank(
  candidates: CandidateRestaurant[],
  matrix: RouteMatrixElement[],
  topN: number
): ScoredRestaurant[] {
  const scored: ScoredRestaurant[] = [];

  for (let d = 0; d < candidates.length; d++) {
    const fromA = matrix.find(
      (el) => el.originIndex === 0 && el.destinationIndex === d
    );
    const fromB = matrix.find(
      (el) => el.originIndex === 1 && el.destinationIndex === d
    );

    // Skip if we don't have valid routes from both users.
    if (!fromA || !fromB) continue;

    const timeA = fromA.durationSeconds;
    const timeB = fromB.durationSeconds;

    const maxTime = Math.max(timeA, timeB);
    const timeDiff = Math.abs(timeA - timeB);
    const fairnessScore = maxTime + 0.3 * timeDiff;

    scored.push({
      ...candidates[d],
      time_from_a_seconds: timeA,
      time_from_b_seconds: timeB,
      distance_from_a_meters: fromA.distanceMeters,
      distance_from_b_meters: fromB.distanceMeters,
      fairness_score: fairnessScore,
    });
  }

  return scored
    .sort((a, b) => a.fairness_score - b.fairness_score)
    .slice(0, topN);
}
