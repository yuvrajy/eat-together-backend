import { haversineDistance, midpoint, computeSearchRadius } from "../src/utils/geo";

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistance({ lat: 34.05, lng: -118.25 }, { lat: 34.05, lng: -118.25 })).toBe(0);
  });

  it("returns ~2445 km between LA and New York", () => {
    const la = { lat: 34.0522, lng: -118.2437 };
    const nyc = { lat: 40.7128, lng: -74.006 };
    const distance = haversineDistance(la, nyc);
    // Should be approximately 3,940 km
    expect(distance).toBeGreaterThan(3_900_000);
    expect(distance).toBeLessThan(3_980_000);
  });

  it("returns a plausible distance for two LA points ~25 min apart", () => {
    const downtown = { lat: 34.0407, lng: -118.2468 };
    const santaMonica = { lat: 34.0195, lng: -118.4912 };
    const dist = haversineDistance(downtown, santaMonica);
    // Should be roughly 20–25 km
    expect(dist).toBeGreaterThan(18_000);
    expect(dist).toBeLessThan(28_000);
  });
});

describe("midpoint", () => {
  it("returns the arithmetic average of lat and lng", () => {
    const a = { lat: 34.0, lng: -118.0 };
    const b = { lat: 34.2, lng: -118.4 };
    const mid = midpoint(a, b);
    expect(mid.lat).toBeCloseTo(34.1, 5);
    expect(mid.lng).toBeCloseTo(-118.2, 5);
  });

  it("works with identical points", () => {
    const p = { lat: 34.05, lng: -118.25 };
    const mid = midpoint(p, p);
    expect(mid.lat).toBe(34.05);
    expect(mid.lng).toBe(-118.25);
  });
});

describe("computeSearchRadius", () => {
  it("clamps to 1000 m for very close points", () => {
    const a = { lat: 34.05, lng: -118.25 };
    const b = { lat: 34.051, lng: -118.251 };
    const radius = computeSearchRadius(a, b);
    expect(radius).toBe(1000);
  });

  it("clamps to 5000 m for very distant points", () => {
    const la = { lat: 34.0522, lng: -118.2437 };
    const nyc = { lat: 40.7128, lng: -74.006 };
    const radius = computeSearchRadius(la, nyc);
    expect(radius).toBe(5000);
  });

  it("returns 50% of distance for mid-range points", () => {
    // Downtown LA ↔ Santa Monica: ~22 km apart → radius ~ 11 km → clamped to 5000
    const downtown = { lat: 34.0407, lng: -118.2468 };
    const santaMonica = { lat: 34.0195, lng: -118.4912 };
    const radius = computeSearchRadius(downtown, santaMonica);
    // 50% of ~22 km = ~11 km → clamped to 5000
    expect(radius).toBe(5000);
  });

  it("returns 50% for Hollywood ↔ Silver Lake (close pair)", () => {
    // ~5 km apart → 50% = ~2.5 km
    const hollywood = { lat: 34.0928, lng: -118.3287 };
    const silverLake = { lat: 34.0869, lng: -118.2702 };
    const radius = computeSearchRadius(hollywood, silverLake);
    expect(radius).toBeGreaterThan(1000);
    expect(radius).toBeLessThanOrEqual(5000);
  });
});
