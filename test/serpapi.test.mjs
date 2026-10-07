import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { callSerpApi, getApiKeys, isOutOfSearches, resetExhaustedKeys, EXHAUSTED_KEY_SKIP_MS } from "../lib/serpapi.mjs";

const OUT = { error: "Your account has run out of searches." };

/** A fake fetch: each key maps to a function returning { status, body }. Records which key each call used. */
function fakeFetch(byKey) {
  const calls = [];
  const fetchFn = async (url) => {
    const key = new URL(url).searchParams.get("api_key");
    calls.push(key);
    const { status = 200, body } = byKey[key]();
    return { ok: status >= 200 && status < 300, status, statusText: `HTTP ${status}`, json: async () => body };
  };
  return { fetchFn, calls };
}

const ok = (n = 1) => () => ({ body: { local_results: [{ position: n }] } });
const outOfSearches = () => ({ status: 429, body: OUT });
const PARAMS = { engine: "google_maps", q: "cafe" };

beforeEach(() => resetExhaustedKeys());

describe("getApiKeys", () => {
  test("keeps priority order, trims, drops blanks and duplicates", () => {
    assert.deepEqual(getApiKeys({ SERPAPI_API_KEY: " a ", SERPAPI_API_KEY_2: "b" }), ["a", "b"]);
    assert.deepEqual(getApiKeys({ SERPAPI_API_KEY: "a", SERPAPI_API_KEY_2: "" }), ["a"]);
    assert.deepEqual(getApiKeys({ SERPAPI_API_KEY: "a", SERPAPI_API_KEY_2: "a" }), ["a"]);
    assert.deepEqual(getApiKeys({}), []);
  });
});

describe("isOutOfSearches", () => {
  test("matches SerpApi's out-of-searches message only", () => {
    assert.equal(isOutOfSearches("Your account has run out of searches."), true);
    assert.equal(isOutOfSearches("Invalid API key. Your API key should be here: ..."), false);
    assert.equal(isOutOfSearches(undefined), false);
  });
});

describe("callSerpApi", () => {
  test("uses the first key when it works, and never touches the second", async () => {
    const { fetchFn, calls } = fakeFetch({ k1: ok(), k2: ok() });
    const json = await callSerpApi(PARAMS, { fetchFn, env: { SERPAPI_API_KEY: "k1", SERPAPI_API_KEY_2: "k2" } });
    assert.equal(json.local_results[0].position, 1);
    assert.deepEqual(calls, ["k1"]);
  });

  test("falls back to the second key when the first is out of searches", async () => {
    const { fetchFn, calls } = fakeFetch({ k1: outOfSearches, k2: ok(2) });
    const json = await callSerpApi(PARAMS, { fetchFn, env: { SERPAPI_API_KEY: "k1", SERPAPI_API_KEY_2: "k2" } });
    assert.equal(json.local_results[0].position, 2);
    assert.deepEqual(calls, ["k1", "k2"]);
  });

  test("remembers an out-of-searches key and skips it on the next call", async () => {
    const env = { SERPAPI_API_KEY: "k1", SERPAPI_API_KEY_2: "k2" };
    const { fetchFn, calls } = fakeFetch({ k1: outOfSearches, k2: ok() });
    await callSerpApi(PARAMS, { fetchFn, env });
    await callSerpApi(PARAMS, { fetchFn, env });
    assert.deepEqual(calls, ["k1", "k2", "k2"]);
  });

  test("tries the first key again after an hour (a monthly reset may have happened)", async () => {
    const env = { SERPAPI_API_KEY: "k1", SERPAPI_API_KEY_2: "k2" };
    let clock = 1_000_000;
    let k1Works = false;
    const { fetchFn, calls } = fakeFetch({ k1: () => (k1Works ? ok()() : outOfSearches()), k2: ok() });
    await callSerpApi(PARAMS, { fetchFn, env, now: () => clock });
    k1Works = true;
    clock += EXHAUSTED_KEY_SKIP_MS + 1;
    await callSerpApi(PARAMS, { fetchFn, env, now: () => clock });
    assert.deepEqual(calls, ["k1", "k2", "k1"]);
  });

  test("when every key is out, throws one clear error without exposing any key", async () => {
    const { fetchFn } = fakeFetch({ secret1: outOfSearches, secret2: outOfSearches });
    await assert.rejects(
      () => callSerpApi(PARAMS, { fetchFn, env: { SERPAPI_API_KEY: "secret1", SERPAPI_API_KEY_2: "secret2" } }),
      (err) => {
        assert.match(err.message, /engine=google_maps/);
        assert.match(err.message, /all 2 API keys are out of searches/);
        assert.doesNotMatch(err.message, /secret1|secret2/);
        return true;
      }
    );
  });

  test("a single key that is out gives the same message as before, plus a note", async () => {
    const { fetchFn } = fakeFetch({ k1: outOfSearches });
    await assert.rejects(
      () => callSerpApi(PARAMS, { fetchFn, env: { SERPAPI_API_KEY: "k1" } }),
      /run out of searches.*the only API key is out of searches/
    );
  });

  test("any other error is thrown straight away, with no fallback", async () => {
    const { fetchFn, calls } = fakeFetch({
      k1: () => ({ status: 400, body: { error: "Missing query `q` parameter." } }),
      k2: ok(),
    });
    await assert.rejects(
      () => callSerpApi(PARAMS, { fetchFn, env: { SERPAPI_API_KEY: "k1", SERPAPI_API_KEY_2: "k2" } }),
      /SerpApi request failed \(engine=google_maps\): Missing query/
    );
    assert.deepEqual(calls, ["k1"]);
  });

  test("an error inside a 200 response counts as an error too", async () => {
    const { fetchFn } = fakeFetch({ k1: () => ({ status: 200, body: { error: "Google hasn't returned any results for this query." } }) });
    await assert.rejects(() => callSerpApi(PARAMS, { fetchFn, env: { SERPAPI_API_KEY: "k1" } }), /hasn't returned any results/);
  });

  test("a non-JSON response (e.g. a gateway HTML page) gives a clear error, not a parse error", async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`);
      },
    });
    await assert.rejects(
      () => callSerpApi(PARAMS, { fetchFn, env: { SERPAPI_API_KEY: "k1", SERPAPI_API_KEY_2: "k2" } }),
      (err) => {
        assert.match(err.message, /engine=google_maps.*non-JSON response \(HTTP 502\)/);
        assert.doesNotMatch(err.message, /DOCTYPE|Unexpected token/);
        return true;
      }
    );
  });

  test("no key configured: the original clear error", async () => {
    await assert.rejects(
      () => callSerpApi(PARAMS, { fetchFn: async () => assert.fail("must not call"), env: {} }),
      /SERPAPI_API_KEY is not set/
    );
  });
});
