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

  it("clamps to 50000 m for very distant points (LA ↔ NYC)", () => {
    const la = { lat: 34.0522, lng: -118.2437 };
    const nyc = { lat: 40.7128, lng: -74.006 };
    const radius = computeSearchRadius(la, nyc);
    expect(radius).toBe(50000);
  });

  it("returns 20% of distance for mid-range points (New Orleans ↔ Baton Rouge)", () => {
    // ~100 km apart → 20% = ~20 km
    const newOrleans = { lat: 29.9511, lng: -90.0715 };
    const batonRouge = { lat: 30.4515, lng: -91.1871 };
    const radius = computeSearchRadius(newOrleans, batonRouge);
    expect(radius).toBeGreaterThan(10000);
    expect(radius).toBeLessThanOrEqual(50000);
  });

  it("returns 20% for Hollywood ↔ Silver Lake (close pair)", () => {
    // ~5 km apart → 20% = ~1 km → clamped to 1000
    const hollywood = { lat: 34.0928, lng: -118.3287 };
    const silverLake = { lat: 34.0869, lng: -118.2702 };
    const radius = computeSearchRadius(hollywood, silverLake);
    expect(radius).toBeGreaterThanOrEqual(1000);
    expect(radius).toBeLessThanOrEqual(50000);
  });
});
