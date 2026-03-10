import { scoreAndRank } from "../src/services/scoring";
import { CandidateRestaurant, RouteMatrixElement } from "../src/types";

const makeCandidates = (n: number): CandidateRestaurant[] =>
  Array.from({ length: n }, (_, i) => ({
    place_id: `place_${i}`,
    name: `Restaurant ${i}`,
    address: `${i} Main St`,
    location: { lat: 34.05 + i * 0.001, lng: -118.25 },
  }));

const makeMatrix = (rows: { oIdx: number; dIdx: number; dur: number; dist: number }[]): RouteMatrixElement[] =>
  rows.map(({ oIdx, dIdx, dur, dist }) => ({
    originIndex: oIdx,
    destinationIndex: dIdx,
    durationSeconds: dur,
    distanceMeters: dist,
  }));

describe("scoreAndRank", () => {
  it("returns top N restaurants sorted by fairness score", () => {
    const candidates = makeCandidates(3);
    // Restaurant 0: A=600s, B=600s → max=600, diff=0 → score=600
    // Restaurant 1: A=300s, B=900s → max=900, diff=600 → score=900+180=1080
    // Restaurant 2: A=400s, B=500s → max=500, diff=100 → score=500+30=530
    const matrix = makeMatrix([
      { oIdx: 0, dIdx: 0, dur: 600, dist: 5000 },
      { oIdx: 1, dIdx: 0, dur: 600, dist: 5000 },
      { oIdx: 0, dIdx: 1, dur: 300, dist: 3000 },
      { oIdx: 1, dIdx: 1, dur: 900, dist: 8000 },
      { oIdx: 0, dIdx: 2, dur: 400, dist: 4000 },
      { oIdx: 1, dIdx: 2, dur: 500, dist: 4500 },
    ]);

    const results = scoreAndRank(candidates, matrix, 3);

    expect(results).toHaveLength(3);
    // Ordered: Restaurant 2 (530) < Restaurant 0 (600) < Restaurant 1 (1080)
    expect(results[0].place_id).toBe("place_2");
    expect(results[1].place_id).toBe("place_0");
    expect(results[2].place_id).toBe("place_1");
  });

  it("excludes restaurants with missing matrix entries", () => {
    const candidates = makeCandidates(3);
    // Only restaurant 1 has data for both origins
    const matrix = makeMatrix([
      { oIdx: 0, dIdx: 0, dur: 600, dist: 5000 },
      // missing originIndex=1, destinationIndex=0 → exclude restaurant 0
      { oIdx: 0, dIdx: 1, dur: 300, dist: 3000 },
      { oIdx: 1, dIdx: 1, dur: 400, dist: 3500 },
      // missing both entries for restaurant 2 → exclude
    ]);

    const results = scoreAndRank(candidates, matrix, 3);

    expect(results).toHaveLength(1);
    expect(results[0].place_id).toBe("place_1");
  });

  it("respects the topN limit", () => {
    const candidates = makeCandidates(5);
    const matrix = makeMatrix(
      Array.from({ length: 5 }, (_, d) => [
        { oIdx: 0, dIdx: d, dur: (d + 1) * 100, dist: (d + 1) * 1000 },
        { oIdx: 1, dIdx: d, dur: (d + 1) * 100, dist: (d + 1) * 1000 },
      ]).flat()
    );

    const results = scoreAndRank(candidates, matrix, 2);
    expect(results).toHaveLength(2);
  });

  it("attaches correct time and distance fields", () => {
    const candidates = makeCandidates(1);
    const matrix = makeMatrix([
      { oIdx: 0, dIdx: 0, dur: 750, dist: 6000 },
      { oIdx: 1, dIdx: 0, dur: 900, dist: 7500 },
    ]);

    const [r] = scoreAndRank(candidates, matrix, 1);

    expect(r.time_from_a_seconds).toBe(750);
    expect(r.time_from_b_seconds).toBe(900);
    expect(r.distance_from_a_meters).toBe(6000);
    expect(r.distance_from_b_meters).toBe(7500);

    // absScore(750, DRIVE) = 1 - 750/3600 ≈ 0.7917
    // absScore(900, DRIVE) = 1 - 900/3600 = 0.75
    // Nash = sqrt(0.7917 × 0.75) ≈ 0.7706 → fairness_score = (1-0.7706)×100 ≈ 22.9
    expect(r.fairness_score).toBeGreaterThan(0);
    expect(r.fairness_score).toBeLessThan(100);
    expect(r.fairness_score).toBeCloseTo(22.9, 0);
  });

  it("returns empty array when no valid routes exist", () => {
    const candidates = makeCandidates(3);
    const results = scoreAndRank(candidates, [], 3);
    expect(results).toHaveLength(0);
  });
});
