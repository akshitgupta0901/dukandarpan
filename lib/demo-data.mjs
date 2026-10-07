/**
 * Judge-mode sample data: 30 days of fictional cafe rankings in Katpadi.
 *
 * PURE and deterministic: the same seed and endDate always give identical
 * output (seeded PRNG; no Math.random, no Date.now), so it is fully testable
 * and re-runnable. Nothing here touches a database -- db/seed-demo.mjs does.
 *
 * Every business is fictional (names, addresses, phone numbers, websites on
 * the reserved .example domain). The payloads are shaped like a real
 * google_maps response (see fixtures/maps_cafe.json) so the rest of the app
 * reads them exactly as it reads live data. The UI labels all of it as demo.
 *
 * The story it tells, for the insight card and competitor panels: the hero,
 * "Brew & Bloom Cafe", climbs from about #12 to #3 in a month but has a
 * fraction of the reviews of the top three, no website, an unclaimed
 * listing and earlier closing hours. A rank drop around day 12 lets a
 * rank-drop alert fire, rivals repeatedly overtake it, and a few competitors
 * gain reviews quickly (so "review growth" has something to show).
 */
import { DEMO_CATEGORY, DEMO_QUERY_TEXT } from "./demo.mjs";
import { evaluateAlert } from "./alert-rule.mjs";

export const HERO_NAME = "Brew & Bloom Cafe";
export const DEMO_DAYS = 30;
export const DEFAULT_SEED = 20260918;
export const MAPS_RESULT_LIMIT = 20; // a google_maps page shows 20; ranks 21+ aren't in the data

const DAY_MS = 24 * 60 * 60 * 1000;
const LAT = 12.968;
const LNG = 79.1503;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRICE_BANDS = {
  low: { price: "₹1–200", extracted_price: 1 },
  mid: { price: "₹200–400", extracted_price: 200 },
  wide: { price: "₹1–400", extracted_price: 1 },
  high: { price: "₹400–1,600", extracted_price: 400 },
};

/**
 * One row per fictional listing. `base` is where a non-hero listing typically
 * ranks (1-21); `noise` is how far its daily score wobbles around that.
 * `reviews`/`growth` are the starting count and reviews gained per day.
 */
const COMPETITORS = [
  { name: "Mocha Meadow Cafe", base: 1, rating: 4.6, reviews: 480, growth: 2.2, price: "high", website: true, orderOnline: true, closes: "11:30 PM", types: ["Cafe", "Coffee shop"] },
  { name: "Kettle & Crumb", base: 2, rating: 4.5, reviews: 365, growth: 3.4, drift: 0.2, price: "mid", website: true, orderOnline: true, closes: "11 PM", types: ["Cafe", "Bakery"] },
  { name: "Latte Lane Cafe", base: 3, rating: 4.4, reviews: 290, growth: 1.1, drift: -0.2, price: "mid", website: false, orderOnline: false, closes: "10:30 PM", types: ["Cafe"] },
  { name: "Filter Kaapi Corner", base: 4, rating: 4.3, reviews: 255, growth: 0.9, price: "low", website: false, orderOnline: false, closes: "10 PM", types: ["Cafe", "Coffee shop"] },
  { name: "The Daily Grind", base: 5, tracked: true, rating: 4.2, reviews: 210, growth: 1.4, price: "mid", website: true, orderOnline: true, closes: "10:30 PM", types: ["Cafe"] },
  { name: "The Velvet Bean", base: 6, rating: 4.5, reviews: 330, growth: 2.6, price: "high", website: true, orderOnline: false, closes: "11 PM", types: ["Cafe", "Dessert shop"] },
  { name: "Cuppa Cottage", base: 7, rating: 4.1, reviews: 175, growth: 0.6, price: "low", website: false, orderOnline: false, closes: "9:30 PM", types: ["Cafe"] },
  { name: "Sip & Savour Studio", base: 8, rating: 4.3, reviews: 240, growth: 1.8, price: "mid", website: true, orderOnline: true, closes: "10:30 PM", types: ["Cafe", "Sandwich shop"] },
  { name: "Tea Tree Terrace", base: 9, rating: 4.0, reviews: 150, growth: 0.5, price: "low", website: false, orderOnline: false, unclaimed: true, closes: "9 PM", types: ["Tea house", "Cafe"] },
  { name: "Beanstalk Bistro", base: 10, rating: 4.4, reviews: 310, growth: 2.0, price: "high", website: true, orderOnline: true, closes: "11 PM", types: ["Cafe", "Restaurant"] },
  { name: "Chai & Chapters", base: 11, rating: 4.6, reviews: 420, growth: 3.0, price: "wide", website: true, orderOnline: false, closes: "10:30 PM", types: ["Cafe", "Book store"] },
  { name: "Roast & Relish", base: 12, rating: 4.2, reviews: 195, growth: 0.8, price: "mid", website: false, orderOnline: true, closes: "10 PM", types: ["Cafe"] },
  { name: "Jasmine Lane Coffee House", base: 13, rating: 4.1, reviews: 165, growth: 0.7, price: "low", website: false, orderOnline: false, closes: "9:30 PM", types: ["Coffee shop"] },
  { name: "Foam & Fable", base: 14, rating: 4.3, reviews: 220, growth: 1.5, price: "mid", website: true, orderOnline: false, closes: "10:30 PM", types: ["Cafe", "Coffee shop"] },
  { name: "Cafe Marigold", base: 15, rating: 4.0, reviews: 140, growth: 0.4, price: "low", website: false, orderOnline: false, unclaimed: true, closes: "9 PM", types: ["Cafe"] },
  { name: "Brew Bungalow", base: 16, rating: 4.2, reviews: 205, growth: 1.0, price: "mid", website: false, orderOnline: true, closes: "10 PM", types: ["Cafe"] },
  { name: "The Sugar Pot", base: 17, rating: 4.4, reviews: 270, growth: 1.3, price: "mid", website: true, orderOnline: false, closes: "10:30 PM", types: ["Dessert shop", "Cafe"] },
  { name: "Cocoa Cove", base: 18, rating: 3.9, reviews: 125, growth: 0.3, price: "low", website: false, orderOnline: false, closes: "9 PM", types: ["Cafe"] },
  { name: "Pour & Ponder", base: 19, rating: 4.1, reviews: 180, growth: 0.9, price: "low", website: false, orderOnline: false, unclaimed: true, closes: "9:30 PM", types: ["Cafe"] },
  { name: "Masala Mug", base: 16.6, tracked: true, noise: 3.2, rating: 4.0, reviews: 130, growth: 0.5, price: "low", website: false, orderOnline: false, closes: "9 PM", types: ["Cafe", "Tea house"] },
  { name: "Saffron Sip Station", base: 21, rating: 4.2, reviews: 190, growth: 1.2, price: "mid", website: true, orderOnline: false, closes: "10 PM", types: ["Cafe"] },
];

const HERO = {
  name: HERO_NAME,
  tracked: true,
  hero: true,
  rating: 4.5,
  reviews: 14,
  growth: 16 / 29, // 14 -> 30 over the month
  price: "wide",
  website: false,
  orderOnline: false,
  unclaimed: true,
  closes: "7 PM",
  types: ["Cafe", "Bakery"],
};

const STREETS = ["Jasmine Lane", "Marigold Street", "Banyan Road", "Lotus Avenue", "Kaveri Cross Road", "Neem Tree Street", "Palm Grove Road"];
const WEEKDAYS = ["friday", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ENTITIES = [HERO, ...COMPETITORS].map((e, i) => ({
  ...e,
  index: i,
  slug: slug(e.name),
  noise: e.noise ?? 1.1,
  drift: e.drift ?? 0,
}));
const HERO_ENTITY = ENTITIES[0];
const NON_HERO = ENTITIES.slice(1);

/** Hero's rank per day: trends from ~#12 to #3 with wobble, plus a sharp dip on days 11-13. */
function buildHeroPath(rng, days) {
  const last = days - 1;
  const trend = (d) => 12 - 9 * (d / last);
  const clamp = (r) => Math.max(1, Math.min(ENTITIES.length, r));
  const path = [];
  for (let d = 0; d < days; d++) {
    const wobble = d === 0 || d === last ? 0 : Math.floor(rng() * 3) - 1; // -1, 0 or +1
    path.push(clamp(Math.round(trend(d) + wobble)));
  }
  if (days >= 15) {
    const before = Math.round(trend(11));
    path[11] = clamp(before);
    path[12] = clamp(before + 4); // sharp dip: at least 3 places
    path[13] = clamp(before + 2);
  }
  return path;
}

function localResult(entity, position, day) {
  const band = PRICE_BANDS[entity.price];
  const rating = Math.round((entity.rating + entity.drift * (day / (DEMO_DAYS - 1))) * 10) / 10;
  const offset = (entity.index + 1) * 0.0011;
  const closes = entity.closes;
  const opens = entity.hero ? "9 AM" : "10 AM";
  const hoursText = `${opens}–${closes}`;
  const street = STREETS[entity.index % STREETS.length];
  const result = {
    position,
    title: entity.name,
    place_id: `DEMO_PLACE_${entity.slug}`,
    data_id: `demo:${entity.slug}`,
    gps_coordinates: {
      latitude: Math.round((LAT + (entity.index % 2 ? offset : -offset)) * 1e7) / 1e7,
      longitude: Math.round((LNG + (entity.index % 3 ? offset : -offset)) * 1e7) / 1e7,
    },
    rating,
    reviews: Math.floor(entity.reviews + entity.growth * day),
    price: band.price,
    extracted_price: band.extracted_price,
    type: entity.types[0],
    types: entity.types,
    address: `${10 + entity.index * 3} ${street}, Sample Nagar, Katpadi, Vellore, Tamil Nadu 632014, India`,
    country: "India",
    open_state: `Open · Closes ${closes}`,
    hours: `Open · Closes ${closes}`,
    operating_hours: Object.fromEntries(WEEKDAYS.map((d) => [d, hoursText])),
    service_options: {
      dine_in: true,
      takeout: entity.index % 4 !== 0,
      delivery: entity.orderOnline,
    },
  };
  result.phone = `+91 00000 ${String(10000 + entity.index * 137).slice(0, 5)}`; // 00000 is not a valid Indian prefix
  if (entity.website) result.website = `https://www.${entity.slug}.example/`;
  if (entity.orderOnline) result.order_online = [`https://order.${entity.slug}.example/menu`];
  if (entity.unclaimed) result.unclaimed_listing = true;
  return result;
}

function utcStamp(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * @param {{ endDate: Date|string|number, seed?: number, days?: number }} opts
 *   endDate is the time of the NEWEST check; earlier checks are exactly 24h apart before it.
 * @returns {{
 *   query: { queryText: string, category: string, lat: number, lng: number, isDemo: true },
 *   businesses: Array<{ name: string, isHero: boolean }>,
 *   days: Array<{ dayIndex: number, checkedAt: string, ranking: string[], payload: object,
 *                 snapshots: Array<{ businessName: string, found: boolean, position: number|null }> }>
 * }}
 */
export function generateDemoData({ endDate, seed = DEFAULT_SEED, days = DEMO_DAYS } = {}) {
  const endMs = new Date(endDate).getTime();
  if (endDate === undefined || endDate === null || !Number.isFinite(endMs)) {
    throw new Error("generateDemoData: endDate is required (a Date or ISO string)");
  }

  const rng = mulberry32(seed);
  const heroPath = buildHeroPath(rng, days);
  const query = { queryText: DEMO_QUERY_TEXT, category: DEMO_CATEGORY, lat: LAT, lng: LNG, isDemo: true };
  const tracked = ENTITIES.filter((e) => e.tracked);

  const out = [];
  for (let d = 0; d < days; d++) {
    const checkedMs = endMs - (days - 1 - d) * DAY_MS;

    const order = NON_HERO.map((e) => ({ e, score: e.base + e.noise * (rng() * 2 - 1) }))
      .sort((a, b) => a.score - b.score || a.e.base - b.e.base)
      .map((x) => x.e);
    const heroRank = heroPath[d];
    const ranked = [...order.slice(0, heroRank - 1), HERO_ENTITY, ...order.slice(heroRank - 1)];

    const visible = ranked.slice(0, MAPS_RESULT_LIMIT);
    const payload = {
      search_metadata: {
        id: `demo-${seed}-${d}`,
        status: "Success",
        created_at: utcStamp(checkedMs),
        processed_at: utcStamp(checkedMs),
        google_maps_url: `https://www.google.com/maps/search/cafe+near+Katpadi/@${LAT},${LNG},14z`,
      },
      search_parameters: {
        engine: "google_maps",
        type: "search",
        q: DEMO_QUERY_TEXT,
        ll: `@${LAT.toFixed(4)},${LNG.toFixed(4)},14z`,
        google_domain: "google.com",
        hl: "en",
      },
      search_information: {
        local_results_state: "Results for exact spelling",
        query_displayed: DEMO_QUERY_TEXT,
      },
      local_results: visible.map((e, i) => localResult(e, i + 1, d)),
      is_demo_data: true,
    };

    const snapshots = tracked.map((e) => {
      const rank = ranked.indexOf(e) + 1;
      const found = rank <= MAPS_RESULT_LIMIT;
      return { businessName: e.name, found, position: found ? rank : null };
    });

    out.push({
      dayIndex: d,
      checkedAt: new Date(checkedMs).toISOString(),
      ranking: ranked.map((e) => e.name),
      payload,
      snapshots,
    });
  }

  return {
    query,
    businesses: tracked.map((e) => ({ name: e.name, isHero: Boolean(e.hero) })),
    days: out,
  };
}

/**
 * The alerts the real pipeline would have raised, from running the project's
 * own evaluateAlert over consecutive daily snapshots. Pure; db/seed-demo.mjs
 * writes them (with telegram_sent = false -- demo data never sends anything).
 */
export function deriveDemoAlerts(data) {
  const alerts = [];
  const previous = new Map();
  for (const day of data.days) {
    for (const s of day.snapshots) {
      const prev = previous.get(s.businessName) ?? null;
      const alert = evaluateAlert({
        previousFound: prev ? prev.found : null,
        previousPosition: prev ? prev.position : null,
        found: s.found,
        position: s.position,
      });
      if (alert) {
        alerts.push({
          dayIndex: day.dayIndex,
          checkedAt: day.checkedAt,
          businessName: s.businessName,
          type: alert.type,
          message: alert.message,
          previousFound: prev.found,
          previousPosition: prev.position,
          newFound: s.found,
          newPosition: s.position,
        });
      }
      previous.set(s.businessName, s);
    }
  }
  return alerts;
}
