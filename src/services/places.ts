import { CandidateRestaurant, Coordinates } from "../types";
import { config } from "../utils/config";

const NEARBY_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchNearby";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.formattedAddress",
  "places.rating",
  "places.priceLevel",
  "places.primaryType",
].join(",");

interface PlacesApiResponse {
  places?: PlaceResult[];
}

interface PlaceResult {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  rating?: number;
  priceLevel?: string;
  primaryType?: string;
}

/**
 * Calls the Google Places API (New) Nearby Search and returns up to 20
 * candidate restaurants around `center` within `radiusMeters`.
 */
export async function findNearbyRestaurants(
  center: Coordinates,
  radiusMeters: number,
  cuisineTypes?: string[]
): Promise<CandidateRestaurant[]> {
  const body = {
    includedTypes: cuisineTypes && cuisineTypes.length > 0 ? cuisineTypes : ["restaurant"],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: radiusMeters,
      },
    },
  };

  const response = await fetch(NEARBY_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googleMapsApiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Places API error ${response.status}: ${errorText}`
    );
  }

  const data = (await response.json()) as PlacesApiResponse;

  if (!data.places || data.places.length === 0) {
    return [];
  }

  return data.places
    .filter(
      (p): p is PlaceResult =>
        !!p.id &&
        !!p.displayName?.text &&
        p.location?.latitude != null &&
        p.location?.longitude != null
    )
    .map((p) => ({
      place_id: p.id!,
      name: p.displayName!.text!,
      address: p.formattedAddress ?? "",
      location: {
        lat: p.location!.latitude!,
        lng: p.location!.longitude!,
      },
      rating: p.rating,
      price_level: p.priceLevel,
      primary_type: p.primaryType,
    }));
}
