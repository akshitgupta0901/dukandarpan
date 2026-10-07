import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateText, isLlmConfigured, getModel, DEFAULT_GEMINI_MODEL } from "../lib/llm.mjs";

const KEY = "test-key-NOT-REAL-123";
const ENV = { GEMINI_API_KEY: KEY };
const INPUT = { system: "Be brief.", prompt: "Hello" };

const okBody = (text) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: `HTTP ${status}`, json: async () => body });

function recordingFetch(response) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return typeof response === "function" ? response(url, init) : response;
  };
  return { fetchFn, calls };
}

describe("isLlmConfigured / getModel", () => {
  test("configured only when GEMINI_API_KEY is non-blank", () => {
    assert.equal(isLlmConfigured({ GEMINI_API_KEY: "abc" }), true);
    assert.equal(isLlmConfigured({ GEMINI_API_KEY: "  " }), false);
    assert.equal(isLlmConfigured({}), false);
  });
  test("model defaults, can be overridden, and rejects characters that don't belong in a URL path", () => {
    assert.equal(getModel({}), DEFAULT_GEMINI_MODEL);
    assert.equal(getModel({ GEMINI_MODEL: "gemini-3.8-flash" }), "gemini-3.8-flash");
    assert.equal(getModel({ GEMINI_MODEL: "x/../../y?z=1" }), DEFAULT_GEMINI_MODEL);
  });
});

describe("generateText", () => {
  test("success: returns the text, and sends the key in a header, never in the URL or body", async () => {
    const { fetchFn, calls } = recordingFetch(reply(200, okBody("  Two sentences here.  ")));
    const text = await generateText(INPUT, { fetchFn, env: ENV });
    assert.equal(text, "Two sentences here.");
    const { url, init } = calls[0];
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    assert.equal(init.method, "POST");
    assert.equal(init.headers["x-goog-api-key"], KEY);
    assert.ok(!url.includes(KEY));
    assert.ok(!init.body.includes(KEY));
    const body = JSON.parse(init.body);
    assert.equal(body.systemInstruction.parts[0].text, "Be brief.");
    assert.equal(body.contents[0].parts[0].text, "Hello");
    assert.equal(body.generationConfig.maxOutputTokens >= 512, true);
  });

  test("uses GEMINI_MODEL when set", async () => {
    const { fetchFn, calls } = recordingFetch(reply(200, okBody("x y")));
    await generateText(INPUT, { fetchFn, env: { ...ENV, GEMINI_MODEL: "gemini-3.8-flash" } });
    assert.match(calls[0].url, /models\/gemini-3\.8-flash:generateContent$/);
  });

  test("no key: throws before any network call", async () => {
    const { fetchFn, calls } = recordingFetch(reply(200, okBody("x")));
    await assert.rejects(generateText(INPUT, { fetchFn, env: {} }), /GEMINI_API_KEY is not set/);
    assert.equal(calls.length, 0);
  });

  test("HTTP error: reports the status and Google's message, not the key", async () => {
    const { fetchFn } = recordingFetch(reply(429, { error: { message: "Quota exceeded for this model." } }));
    await assert.rejects(generateText(INPUT, { fetchFn, env: ENV }), (err) => {
      assert.match(err.message, /HTTP 429.*Quota exceeded/);
      assert.ok(!err.message.includes(KEY));
      return true;
    });
  });

  test("HTTP error with a non-JSON body (a gateway page)", async () => {
    const { fetchFn } = recordingFetch({ ok: false, status: 502, statusText: "Bad Gateway", json: async () => { throw new SyntaxError("Unexpected token <"); } });
    await assert.rejects(generateText(INPUT, { fetchFn, env: ENV }), /non-JSON response \(HTTP 502\)/);
  });

  test("malformed JSON on a 200 response", async () => {
    const { fetchFn } = recordingFetch({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } });
    await assert.rejects(generateText(INPUT, { fetchFn, env: ENV }), /non-JSON response/);
  });

  test("timeout: aborts the request and says so", async () => {
    const fetchFn = (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    await assert.rejects(generateText(INPUT, { fetchFn, env: ENV, timeoutMs: 20 }), /timed out after 20 ms/);
  });

  test("network failure: a short error without the key", async () => {
    const fetchFn = async () => { throw new TypeError("fetch failed"); };
    await assert.rejects(generateText(INPUT, { fetchFn, env: ENV }), (err) => {
      assert.match(err.message, /Gemini request failed: fetch failed/);
      assert.ok(!err.message.includes(KEY));
      return true;
    });
  });

  test("a prompt blocked by safety filters", async () => {
    const { fetchFn } = recordingFetch(reply(200, { promptFeedback: { blockReason: "SAFETY" } }));
    await assert.rejects(generateText(INPUT, { fetchFn, env: ENV }), /blocked the prompt \(SAFETY\)/);
  });

  test("an empty answer (e.g. thinking used up the token limit) is an error, with the finish reason", async () => {
    const { fetchFn } = recordingFetch(reply(200, { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
    await assert.rejects(generateText(INPUT, { fetchFn, env: ENV }), /no text \(finishReason: MAX_TOKENS\)/);
  });

  test("thought parts are skipped, multiple answer parts are joined", async () => {
    const { fetchFn } = recordingFetch(
      reply(200, { candidates: [{ content: { parts: [{ text: "internal reasoning", thought: true }, { text: "Part one. " }, { text: "Part two." }] } }] })
    );
    assert.equal(await generateText(INPUT, { fetchFn, env: ENV }), "Part one. Part two.");
  });
});
