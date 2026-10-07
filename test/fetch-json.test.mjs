import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchJson, LOAD_ERROR_MESSAGE } from "../lib/fetch-json.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(response) {
  globalThis.fetch = async () => response;
}

describe("fetchJson", () => {
  test("returns the parsed body on a 200 JSON response", async () => {
    stubFetch(new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    assert.deepEqual(await fetchJson("/x"), { ok: 1 });
  });

  test("an HTML error page becomes the friendly message, not a JSON parse error", async () => {
    stubFetch(new Response("<!DOCTYPE html><html><body>Internal Server Error</body></html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    }));
    await assert.rejects(fetchJson("/x"), (err) => {
      assert.equal(err.message, LOAD_ERROR_MESSAGE);
      assert.doesNotMatch(err.message, /DOCTYPE|JSON|Unexpected token/);
      return true;
    });
  });

  test("an HTML 200 response (not valid JSON) also gets the friendly message", async () => {
    stubFetch(new Response("<!DOCTYPE html><html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    await assert.rejects(fetchJson("/x"), { message: LOAD_ERROR_MESSAGE });
  });

  test("a JSON { error } body from our own API is passed through", async () => {
    stubFetch(new Response(JSON.stringify({ error: "category query param is required" }), { status: 400 }));
    await assert.rejects(fetchJson("/x"), { message: "category query param is required" });
  });

  test("a JSON error response with no message falls back to the friendly message", async () => {
    stubFetch(new Response(JSON.stringify({}), { status: 500 }));
    await assert.rejects(fetchJson("/x"), { message: LOAD_ERROR_MESSAGE });
  });

  test("a network failure becomes the friendly message", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(fetchJson("/x"), { message: LOAD_ERROR_MESSAGE });
  });

  test("a custom fallback message is used for non-JSON responses", async () => {
    stubFetch(new Response("<!DOCTYPE html>", { status: 502 }));
    await assert.rejects(fetchJson("/x", undefined, "Couldn't save, try again"), { message: "Couldn't save, try again" });
  });
});
