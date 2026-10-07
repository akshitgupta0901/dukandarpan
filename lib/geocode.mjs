
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "DukanDarpan/1.0 (SerpApi India Hackathon project; contact: akshitgupta090106@gmail.com)";

const LAT_LNG_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

function parseLatLng(input) {
  const match = LAT_LNG_PATTERN.exec(input);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`"${input}" looks like lat,lng but is out of range (lat -90..90, lng -180..180)`);
  }
  return { lat, lng };
}

async function geocodeViaNominatim(placeName) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", placeName);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Geocoding request failed (HTTP ${res.status}) for "${placeName}"`);
  }
  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`Couldn't find a location matching "${placeName}" -- try a more specific place name, or enter "lat,lng" directly`);
  }
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

/** True when the input is a "lat,lng" pair rather than a place name. */
export function isLatLng(input) {
  return LAT_LNG_PATTERN.test(String(input ?? ""));
}

export async function geocodeLocation(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) throw new Error("Location is required (a city/place name, or lat,lng)");

  const direct = parseLatLng(trimmed);
  if (direct) return direct;

  return geocodeViaNominatim(trimmed);
}
