/**
 * Integration tests for the /api/suggest endpoint.
 * These tests mock the Google API calls so no real API key is needed.
 */
import express from "express";
import request from "supertest";
import suggestRouter from "../src/routes/suggest";

// Stub config before importing anything that reads it
jest.mock("../src/utils/config", () => ({
  config: { googleMapsApiKey: "test-key", port: 3000 },
}));

jest.mock("../src/services/places");
jest.mock("../src/services/routes");

import { findNearbyRestaurants } from "../src/services/places";
import { getRouteMatrix } from "../src/services/routes";
import { CandidateRestaurant, RouteMatrixElement } from "../src/types";

const mockFindNearby = findNearbyRestaurants as jest.MockedFunction<typeof findNearbyRestaurants>;
const mockGetMatrix = getRouteMatrix as jest.MockedFunction<typeof getRouteMatrix>;

const app = express();
app.use(express.json());
app.use("/api/suggest", suggestRouter);

const MOCK_CANDIDATES: CandidateRestaurant[] = [
  {
    place_id: "place_A",
    name: "Bestia",
    address: "2121 E 7th Pl, Los Angeles, CA",
    location: { lat: 34.0345, lng: -118.2318 },
    rating: 4.6,
    price_level: "PRICE_LEVEL_MODERATE",
  },
  {
    place_id: "place_B",
    name: "Otium",
    address: "222 S Hope St, Los Angeles, CA",
    location: { lat: 34.051, lng: -118.2583 },
    rating: 4.3,
    price_level: "PRICE_LEVEL_MODERATE",
  },
  {
    place_id: "place_C",
    name: "Perch",
    address: "448 S Hill St, Los Angeles, CA",
    location: { lat: 34.048, lng: -118.254 },
    rating: 4.1,
    price_level: "PRICE_LEVEL_EXPENSIVE",
  },
];

const MOCK_MATRIX: RouteMatrixElement[] = [
  { originIndex: 0, destinationIndex: 0, durationSeconds: 900, distanceMeters: 8000 },
  { originIndex: 1, destinationIndex: 0, durationSeconds: 1200, distanceMeters: 11000 },
  { originIndex: 0, destinationIndex: 1, durationSeconds: 600, distanceMeters: 5000 },
  { originIndex: 1, destinationIndex: 1, durationSeconds: 700, distanceMeters: 6000 },
  { originIndex: 0, destinationIndex: 2, durationSeconds: 1800, distanceMeters: 15000 },
  { originIndex: 1, destinationIndex: 2, durationSeconds: 400, distanceMeters: 3500 },
];

const VALID_BODY = {
  user_a: { lat: 34.0407, lng: -118.2468 },
  user_b: { lat: 34.0195, lng: -118.4912 },
};

describe("POST /api/suggest", () => {
  beforeEach(() => {
    mockFindNearby.mockResolvedValue(MOCK_CANDIDATES);
    mockGetMatrix.mockResolvedValue(MOCK_MATRIX);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with top 3 scored restaurants", async () => {
    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.midpoint).toHaveProperty("lat");
    expect(res.body.midpoint).toHaveProperty("lng");
    expect(res.body.search_radius_meters).toBeGreaterThan(0);
  });

  it("results are ordered by fairness_score ascending", async () => {
    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    const scores: number[] = res.body.results.map(
      (r: { fairness_score: number }) => r.fairness_score
    );
    expect(scores[0]).toBeLessThanOrEqual(scores[1]);
    expect(scores[1]).toBeLessThanOrEqual(scores[2]);
  });

  it("each result includes time_from_a/b and distance_from_a/b", async () => {
    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    for (const r of res.body.results) {
      expect(typeof r.time_from_a_seconds).toBe("number");
      expect(typeof r.time_from_b_seconds).toBe("number");
      expect(typeof r.distance_from_a_meters).toBe("number");
      expect(typeof r.distance_from_b_meters).toBe("number");
    }
  });

  it("returns 400 when user_a is missing", async () => {
    const res = await request(app)
      .post("/api/suggest")
      .send({ user_b: VALID_BODY.user_b });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user_a/i);
  });

  it("returns 400 when coordinates are out of range", async () => {
    const res = await request(app)
      .post("/api/suggest")
      .send({ user_a: { lat: 999, lng: -118.25 }, user_b: VALID_BODY.user_b });

    expect(res.status).toBe(400);
  });

  it("retries with larger radius when no candidates found initially", async () => {
    // With 2 users: 2 search centers (centroid + pairwise midpoint) × 1 generic call = 2 initial calls
    // All return empty → triggers radius expansion → 2 more calls with larger radius
    mockFindNearby.mockResolvedValue(MOCK_CANDIDATES);
    // First batch (sparse) returns nothing to force expansion
    mockFindNearby
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue(MOCK_CANDIDATES);

    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    expect(res.status).toBe(200);
    // Expansion calls should use a larger radius than initial calls
    const firstRadius = (mockFindNearby.mock.calls[0] as unknown[])[1] as number;
    const lastRadius = (mockFindNearby.mock.calls[mockFindNearby.mock.calls.length - 1] as unknown[])[1] as number;
    expect(lastRadius).toBeGreaterThan(firstRadius);
  });

  it("returns 404 when no candidates found even after retry", async () => {
    mockFindNearby.mockResolvedValue([]);

    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  it("passes travel_mode to getRouteMatrix", async () => {
    await request(app)
      .post("/api/suggest")
      .send({ ...VALID_BODY, travel_mode: "WALK" });

    expect(mockGetMatrix).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      "WALK"
    );
  });

  it("passes cuisine_types to findNearbyRestaurants", async () => {
    await request(app)
      .post("/api/suggest")
      .send({ ...VALID_BODY, cuisine_types: ["sushi_restaurant"] });

    expect(mockFindNearby).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Number),
      ["sushi_restaurant"]
    );
  });

  it("returns 502 when findNearbyRestaurants throws", async () => {
    mockFindNearby.mockRejectedValue(new Error("Places API error 503: overloaded"));

    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Upstream API error/);
  });

  it("returns 502 when getRouteMatrix throws", async () => {
    mockGetMatrix.mockRejectedValue(new Error("Routes API error 400: Invalid request"));

    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Upstream API error/);
  });

  it("truncates candidates to MAX_CANDIDATES before route matrix call", async () => {
    const manyCandidates: CandidateRestaurant[] = Array.from({ length: 400 }, (_, i) => ({
      place_id: `place_${i}`,
      name: `Restaurant ${i}`,
      address: `${i} Main St`,
      location: { lat: 34.05 + i * 0.0001, lng: -118.25 },
      rating: 4,
      user_rating_count: 100,
    }));
    const matrixForMany = manyCandidates.flatMap((_, dIdx) =>
      [0, 1].map((oIdx) => ({
        originIndex: oIdx,
        destinationIndex: dIdx,
        durationSeconds: 600,
        distanceMeters: 5000,
      }))
    );
    mockFindNearby.mockResolvedValue(manyCandidates);
    mockGetMatrix.mockResolvedValue(matrixForMany);

    await request(app).post("/api/suggest").send(VALID_BODY);

    // 2 users → MAX_CANDIDATES = floor(625/2) = 312
    expect(mockGetMatrix).toHaveBeenCalled();
    const [, destinations] = mockGetMatrix.mock.calls[0];
    expect(destinations).toHaveLength(312);
  });

  it("returns 404 when route matrix has no valid routes", async () => {
    mockGetMatrix.mockResolvedValue([]);

    const res = await request(app).post("/api/suggest").send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Could not calculate routes|no nearby restaurants/);
  });
});
