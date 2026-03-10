export interface Coordinates {
  lat: number;
  lng: number;
}

export type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";

export interface UserPreference {
  /** Ordered list: first = highest priority */
  priorities: ("distance" | "cuisine" | "price" | "vibe")[];
  /** Multiple Google place types e.g. ["italian_restaurant", "sushi_restaurant"] */
  cuisineTypes?: string[];
  /** e.g. "PRICE_LEVEL_MODERATE" — restaurants at or below this pass */
  maxPrice?: string;
  /** "niche" = hidden gems (fewer reviews), "mainstream" = popular (more reviews) */
  vibe?: "niche" | "mainstream" | "any";
}

export interface SuggestRequest {
  /** N users (2+). */
  users: Coordinates[];
  travel_mode?: TravelMode;
  mode?: "simple" | "extraFair";
  /** One preference object per user, aligned with users[]. extraFair only. */
  preferences?: UserPreference[];
  /** Simple mode cuisine filter — any restaurant must match at least one type */
  cuisine_types?: string[];
  /** Simple mode hard price cap e.g. "PRICE_LEVEL_MODERATE" */
  max_price?: string;
}

export interface CandidateRestaurant {
  place_id: string;
  name: string;
  address: string;
  location: Coordinates;
  rating?: number;
  price_level?: string;
  primary_type?: string;
  user_rating_count?: number;
}

export interface ScoredRestaurant extends CandidateRestaurant {
  /** Travel times indexed by user position (users[0], users[1], …) */
  travel_times_seconds: number[];
  travel_distances_meters: number[];
  /** Convenience aliases kept for iOS backward compat */
  time_from_a_seconds: number;
  time_from_b_seconds: number;
  distance_from_a_meters: number;
  distance_from_b_meters: number;
  fairness_score: number;
}

export interface SuggestResponse {
  midpoint: Coordinates;
  search_radius_meters: number;
  mode: "simple" | "extraFair";
  results: ScoredRestaurant[];
}

export interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  durationSeconds: number;
  distanceMeters: number;
}
