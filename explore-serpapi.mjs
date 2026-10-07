

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const out = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // strip surrounding quotes if present
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

let envSource = ".env";
let env = loadEnvFile(path.join(__dirname, ".env"));
if (!env || !env.SERPAPI_API_KEY) {
  envSource = ".env.local";
  env = loadEnvFile(path.join(__dirname, ".env.local"));
}

const API_KEY = env?.SERPAPI_API_KEY;
if (!API_KEY) {
  console.error(
    "No SERPAPI_API_KEY found in .env or .env.local next to this script. Aborting."
  );
  process.exit(1);
}
console.log(`Using SERPAPI_API_KEY from ${envSource} (${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)})`);


const LL = "@12.9680,79.1503,14z"; // Katpadi, Vellore
const LOCATION = "Vellore, Tamil Nadu, India";

const CATEGORIES = [
  {
    slug: "restaurant",
    query: "restaurant near VIT Vellore",
    targets: ["Zaitoon Restaurant", "Eato Restaurant", "Katpadi Kitchen"],
  },
  {
    slug: "salon",
    query: "salon in Katpadi",
    targets: [
      "Elegant Landmark Unisex Salon",
      "Studieo7 Signature Lounge",
      "Simply Sparkle Beauty Salon",
    ],
  },
  {
    slug: "gym",
    query: "gym near VIT Vellore",
    targets: ["Infinity Fitness Gym", "Aesthetic Den", "iMMc Fit Club"],
  },
  {
    slug: "cafe",
    query: "cafe near VIT Vellore",
    targets: ["Café Laylat", "Hangout Cafe"],
  },
];



function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (é -> e)
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


function findMatch(targetName, items, nameFields) {
  const targetWords = normalize(targetName)
    .split(" ")
    .filter((w) => w.length > 1); // drop stray single letters
  if (targetWords.length === 0) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    for (const field of nameFields) {
      const val = item[field];
      if (typeof val !== "string") continue;
      const normVal = normalize(val);
      if (targetWords.every((w) => normVal.includes(w))) {
        return { index: i, item };
      }
    }
  }
  return null;
}

async function callSerpApi(params, label) {
  const url = new URL("https://serpapi.com/search.json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", API_KEY);

  const maskedUrl = url.toString().replace(API_KEY, `${API_KEY.slice(0, 6)}...`);
  console.log(`  → ${label}: ${maskedUrl}`);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || json.error) {
    console.error(`  ✗ ${label} failed (HTTP ${res.status}): ${json.error || res.statusText}`);
  }
  return json;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}



async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  const results = []; // collected for the summary pass

  for (const cat of CATEGORIES) {
    console.log(`\n=== ${cat.slug.toUpperCase()}: "${cat.query}" ===`);

    // --- google_maps (type=search) ---
    const mapsJson = await callSerpApi(
      {
        engine: "google_maps",
        type: "search",
        q: cat.query,
        ll: LL,
      },
      "google_maps"
    );
    const mapsFixturePath = path.join(FIXTURES_DIR, `maps_${cat.slug}.json`);
    fs.writeFileSync(mapsFixturePath, JSON.stringify(mapsJson, null, 2));
    console.log(`  saved -> fixtures/maps_${cat.slug}.json`);

    await sleep(800); // be polite to the API / avoid rate limiting

    // --- google (organic) ---
    const organicJson = await callSerpApi(
      {
        engine: "google",
        q: cat.query,
        location: LOCATION,
        gl: "in",
        hl: "en",
      },
      "google (organic)"
    );
    const organicFixturePath = path.join(FIXTURES_DIR, `organic_${cat.slug}.json`);
    fs.writeFileSync(organicFixturePath, JSON.stringify(organicJson, null, 2));
    console.log(`  saved -> fixtures/organic_${cat.slug}.json`);

    await sleep(800);

    results.push({ cat, mapsJson, organicJson });
  }


  console.log("\n\n################  SUMMARY  ################\n");

  // 4a. Which field holds rank/position, sampled from the first non-empty response
  console.log("--- Rank/position field ---");
  const sampleMaps = results.find((r) => r.mapsJson.local_results?.length)?.mapsJson;
  const sampleOrganic = results.find((r) => r.organicJson.organic_results?.length)?.organicJson;

  if (sampleMaps?.local_results?.length) {
    const first = sampleMaps.local_results[0];
    console.log(
      `google_maps (type=search) -> local_results[i].position` +
        ` (sample: position=${first.position}, title="${first.title}")`
    );
    console.log(`  full key list on a local_results item: ${Object.keys(first).join(", ")}`);
  } else {
    console.log("google_maps -> local_results was empty in every response, can't confirm the field from live data.");
  }

  if (sampleOrganic?.organic_results?.length) {
    const first = sampleOrganic.organic_results[0];
    console.log(
      `google (organic) -> organic_results[i].position` +
        ` (sample: position=${first.position}, title="${first.title}")`
    );
    console.log(`  full key list on an organic_results item: ${Object.keys(first).join(", ")}`);
  } else {
    console.log("google (organic) -> organic_results was empty in every response, can't confirm the field from live data.");
  }

  const sampleLocalPack = results.find((r) => r.organicJson.local_results)?.organicJson;
  if (sampleLocalPack) {
    const lr = sampleLocalPack.local_results;
    const packItems = Array.isArray(lr) ? lr : lr.places || [];
    console.log(
      `google (organic) also returned a local_results block (the "map pack") ${
        Array.isArray(lr) ? "(array)" : "(object" + (lr.places ? " with .places[]" : "") + ")"
      }, ${packItems.length} item(s).`
    );
    if (packItems[0]) {
      console.log(`  keys on a local_results/places item: ${Object.keys(packItems[0]).join(", ")}`);
    }
  } else {
    console.log("google (organic) -> no local_results (map pack) block appeared in any response.");
  }

  // 4b. Business presence check
  console.log("\n--- Business presence check ---");
  for (const { cat, mapsJson, organicJson } of results) {
    console.log(`\n${cat.slug.toUpperCase()} ("${cat.query}")`);
    const mapsItems = mapsJson.local_results || [];
    const organicItems = organicJson.organic_results || [];
    const organicLocalRaw = organicJson.local_results;
    const organicLocalItems = Array.isArray(organicLocalRaw)
      ? organicLocalRaw
      : organicLocalRaw?.places || [];

    for (const target of cat.targets) {
      const inMaps = findMatch(target, mapsItems, ["title"]);
      const inOrganic = findMatch(target, organicItems, ["title", "snippet"]);
      const inOrganicLocalPack = findMatch(target, organicLocalItems, ["title"]);

      const mapsStr = inMaps
        ? `FOUND at maps position ${inMaps.item.position ?? "(no position field)"}`
        : "not found";
      const organicStr = inOrganic
        ? `FOUND at organic position ${inOrganic.item.position ?? "(no position field)"}`
        : "not found";
      const localPackStr = organicLocalItems.length
        ? inOrganicLocalPack
          ? `FOUND in organic's local_results (map pack)`
          : "not in organic's local_results (map pack)"
        : "no local_results block to check";

      console.log(`  - ${target}`);
      console.log(`      google_maps:        ${mapsStr}`);
      console.log(`      google organic:     ${organicStr}`);
      console.log(`      organic local pack: ${localPackStr}`);
    }

    console.log(
      `  (context: google_maps returned ${mapsItems.length} local_results; ` +
        `organic returned ${organicItems.length} organic_results` +
        (organicLocalItems.length ? ` + ${organicLocalItems.length} local_results (map pack)` : "") +
        `)`
    );
  }

  console.log("\n#############################################\n");
  console.log(`Fixtures written to: ${FIXTURES_DIR}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
