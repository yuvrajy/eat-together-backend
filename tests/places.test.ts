/**
 * Unit tests for places service (Google Places API client).
 */
jest.mock("../src/utils/config", () => ({
  config: { googleMapsApiKey: "test-key" },
}));

import { findNearbyRestaurants } from "../src/services/places";

const mockFetch = jest.fn();

describe("findNearbyRestaurants", () => {
  beforeEach(() => {
    jest.spyOn(globalThis, "fetch").mockImplementation(mockFetch as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses valid API response into CandidateRestaurant list", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "ChIJxyz",
            displayName: { text: "Test Restaurant" },
            location: { latitude: 34.05, longitude: -118.25 },
            formattedAddress: "123 Main St",
            rating: 4.5,
            priceLevel: "PRICE_LEVEL_MODERATE",
            userRatingCount: 100,
          },
        ],
      }),
      text: async () => "",
    } as Response);

    const result = await findNearbyRestaurants(
      { lat: 34.05, lng: -118.25 },
      5000
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      place_id: "ChIJxyz",
      name: "Test Restaurant",
      address: "123 Main St",
      location: { lat: 34.05, lng: -118.25 },
      rating: 4.5,
      price_level: "PRICE_LEVEL_MODERATE",
      user_rating_count: 100,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:searchNearby",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Goog-Api-Key": "test-key" }),
      })
    );
  });

  it("returns empty array when API returns no places", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ places: [] }),
      text: async () => "",
    } as Response);

    const result = await findNearbyRestaurants(
      { lat: 34.05, lng: -118.25 },
      5000
    );

    expect(result).toEqual([]);
  });

  it("throws with message when API returns error status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "API key invalid",
    } as Response);

    await expect(
      findNearbyRestaurants({ lat: 34.05, lng: -118.25 }, 5000)
    ).rejects.toThrow(/Places API error 403/);
  });
});
