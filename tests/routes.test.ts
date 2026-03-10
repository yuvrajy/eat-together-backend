/**
 * Unit tests for routes service (Google Routes API client).
 */
jest.mock("../src/utils/config", () => ({
  config: { googleMapsApiKey: "test-key" },
}));

import { getRouteMatrix } from "../src/services/routes";

const mockFetch = jest.fn();

describe("getRouteMatrix", () => {
  beforeEach(() => {
    jest.spyOn(globalThis, "fetch").mockImplementation(mockFetch as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses valid API response and filters by ROUTE_EXISTS", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          originIndex: 0,
          destinationIndex: 0,
          duration: "600s",
          distanceMeters: 5000,
          condition: "ROUTE_EXISTS",
        },
        {
          originIndex: 1,
          destinationIndex: 0,
          duration: "900s",
          distanceMeters: 7000,
          condition: "ROUTE_EXISTS",
        },
        {
          originIndex: 0,
          destinationIndex: 1,
          condition: "ROUTE_NOT_FOUND",
        },
      ] as unknown[],
      text: async () => "",
    } as Response);

    const result = await getRouteMatrix(
      [
        { lat: 34.04, lng: -118.24 },
        { lat: 34.05, lng: -118.25 },
      ],
      [
        { lat: 34.045, lng: -118.245 },
        { lat: 34.055, lng: -118.255 },
      ],
      "DRIVE"
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      originIndex: 0,
      destinationIndex: 0,
      durationSeconds: 600,
      distanceMeters: 5000,
    });
    expect(result[1]).toEqual({
      originIndex: 1,
      destinationIndex: 0,
      durationSeconds: 900,
      distanceMeters: 7000,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Goog-Api-Key": "test-key" }),
      })
    );
  });

  it("throws with message when API returns error status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Invalid travel mode",
    } as Response);

    await expect(
      getRouteMatrix(
        [{ lat: 34.04, lng: -118.24 }],
        [{ lat: 34.05, lng: -118.25 }],
        "INVALID"
      )
    ).rejects.toThrow(/Routes API error 400/);
  });
});
