export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SuggestRequest {
  user_a: Coordinates;
  user_b: Coordinates;
  travel_mode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
  cuisine_types?: string[]; // e.g. ["italian_restaurant", "sushi_restaurant"]
}

export interface CandidateRestaurant {
  place_id: string;
  name: string;
  address: string;
  location: Coordinates;
  rating?: number;
  price_level?: string;
  primary_type?: string;
}

export interface ScoredRestaurant extends CandidateRestaurant {
  time_from_a_seconds: number;
  time_from_b_seconds: number;
  distance_from_a_meters: number;
  distance_from_b_meters: number;
  fairness_score: number;
}

export interface SuggestResponse {
  midpoint: Coordinates;
  search_radius_meters: number;
  results: ScoredRestaurant[];
}

export interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  durationSeconds: number;
  distanceMeters: number;
}
