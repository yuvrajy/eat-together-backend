# EatTogether Backend

Find a fair restaurant meetup point for 2+ users using Google Places and Routes APIs. Supports **simple** (distance-focused) and **extraFair** (cuisine preferences and fairness) modes.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_MAPS_API_KEY` | Yes | Google Cloud API key with Places (New) and Routes APIs enabled |
| `PORT` | No | Server port (default: 3000) |

## Local setup

```bash
npm install
npm run dev
```

Production build and run:

```bash
npm run build
npm start
```

## API

### `POST /api/suggest`

Returns ranked restaurant suggestions around a fair midpoint for the given users.

**Minimal payload (legacy):**

```json
{
  "user_a": { "lat": 34.0407, "lng": -118.2468 },
  "user_b": { "lat": 34.0195, "lng": -118.4912 }
}
```

**With `users[]` (2+ users):**

```json
{
  "users": [
    { "lat": 34.0407, "lng": -118.2468 },
    { "lat": 34.0195, "lng": -118.4912 }
  ]
}
```

**With options:**

```json
{
  "users": [
    { "lat": 34.0407, "lng": -118.2468 },
    { "lat": 34.0195, "lng": -118.4912 }
  ],
  "travel_mode": "DRIVE",
  "mode": "simple",
  "cuisine_types": ["sushi_restaurant", "japanese_restaurant"],
  "max_price": "PRICE_LEVEL_MODERATE"
}
```

**Supported values:**

- **travel_mode:** `DRIVE`, `WALK`, `BICYCLE`, `TRANSIT`
- **mode:** `simple`, `extraFair`

**Response:** `{ midpoint, search_radius_meters, mode, results }` where `results` is an array of scored restaurants (travel times, distances, fairness_score).

### `GET /api/health`

Returns `{ status: "ok", version, timestamp }`.

## Deploy

The app runs on any Node host (e.g. Railway, Render). Set `GOOGLE_MAPS_API_KEY` and optionally `PORT` in the environment.
