import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatJson, truncateLines, tokenizeLine, DEFAULT_COLLAPSE_LINES } from "../lib/json-view.mjs";
import { nextFocusIndex } from "../lib/focus-trap.mjs";

const types = (line) => tokenizeLine(line).filter((t) => t.type !== "space").map((t) => `${t.type}:${t.text}`);

describe("tokenizeLine", () => {
  test("a key, a string value and the punctuation between them", () => {
    assert.deepEqual(types('  "title": "Cafe Laylat",'), ['key:"title"', "punct::", 'string:"Cafe Laylat"', "punct:,"]);
  });

  test("numbers: integers, negatives, decimals and exponents", () => {
    assert.deepEqual(types('  "n": 12,'), ['key:"n"', "punct::", "number:12", "punct:,"]);
    assert.deepEqual(types('"a": -3.5'), ['key:"a"', "punct::", "number:-3.5"]);
    assert.deepEqual(types('"e": 1.5e+10'), ['key:"e"', "punct::", "number:1.5e+10"]);
  });

  test("booleans and null get their own types", () => {
    assert.deepEqual(types('"on": true,'), ['key:"on"', "punct::", "boolean:true", "punct:,"]);
    assert.deepEqual(types('"off": false'), ['key:"off"', "punct::", "boolean:false"]);
    assert.deepEqual(types('"x": null'), ['key:"x"', "punct::", "null:null"]);
  });

  test("brackets and braces are punctuation, and array items are plain strings, not keys", () => {
    assert.deepEqual(types('"types": ['), ['key:"types"', "punct::", "punct:["]);
    assert.deepEqual(types('    "Cafe",'), ['string:"Cafe"', "punct:,"]);
    assert.deepEqual(types("  },"), ["punct:}", "punct:,"]);
    assert.deepEqual(types("{"), ["punct:{"]);
  });

  test("a string containing a colon, braces, quotes or digits stays one string", () => {
    assert.deepEqual(types('"u": "https://x.example/a?b=1: {c}"'), ['key:"u"', "punct::", 'string:"https://x.example/a?b=1: {c}"']);
    assert.deepEqual(types('"q": "say \\"hi\\" 42"'), ['key:"q"', "punct::", 'string:"say \\"hi\\" 42"']);
  });

  test("keywords and numbers inside strings are not highlighted separately", () => {
    assert.deepEqual(types('"s": "true null 123"'), ['key:"s"', "punct::", 'string:"true null 123"']);
  });

  test("unicode and emoji pass through", () => {
    assert.deepEqual(types('"t": "Café ₹400 ☕"'), ['key:"t"', "punct::", 'string:"Café ₹400 ☕"']);
  });

  test("the tokens of a line always join back to exactly that line", () => {
    const value = { a: [1, 2.5, -3, true, false, null, "x\"y\\z", { b: "c: d" }], "ke y": "é", empty: {}, list: [] };
    for (const line of formatJson(value).split("\n")) {
      assert.equal(tokenizeLine(line).map((t) => t.text).join(""), line);
    }
  });

  test("markup in a value stays inside its string token (nothing is ever treated as HTML)", () => {
    const tokens = tokenizeLine('"x": "<img src=x onerror=alert(1)>"');
    assert.equal(tokens.find((t) => t.type === "string").text, '"<img src=x onerror=alert(1)>"');
  });

  test("an empty line gives no tokens", () => {
    assert.deepEqual(tokenizeLine(""), []);
  });
});

describe("formatJson / truncateLines", () => {
  test("pretty-prints with two-space indentation", () => {
    assert.equal(formatJson({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}');
  });

  test("short output is not truncated", () => {
    const t = truncateLines("a\nb\nc", 10);
    assert.deepEqual(t, { lines: ["a", "b", "c"], totalLines: 3, truncated: false });
  });

  test("long output is cut to the limit and reports the true total", () => {
    const text = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
    const t = truncateLines(text, DEFAULT_COLLAPSE_LINES);
    assert.equal(t.lines.length, DEFAULT_COLLAPSE_LINES);
    assert.equal(t.totalLines, 1000);
    assert.equal(t.truncated, true);
    assert.equal(t.lines[0], "line 0");
  });

  test("exactly at the limit is not truncated; the limit is at least 1", () => {
    assert.equal(truncateLines("a\nb", 2).truncated, false);
    assert.equal(truncateLines("a\nb", 0).lines.length, 1);
    assert.equal(truncateLines(undefined).totalLines, 1);
  });
});

describe("nextFocusIndex (modal focus trap)", () => {
  test("Tab moves forward and wraps from the last element to the first", () => {
    assert.equal(nextFocusIndex(3, 0, false), 1);
    assert.equal(nextFocusIndex(3, 1, false), 2);
    assert.equal(nextFocusIndex(3, 2, false), 0);
  });

  test("Shift+Tab moves back and wraps from the first element to the last", () => {
    assert.equal(nextFocusIndex(3, 2, true), 1);
    assert.equal(nextFocusIndex(3, 0, true), 2);
  });

  test("focus on the dialog itself or outside it enters at the right end", () => {
    assert.equal(nextFocusIndex(3, -1, false), 0);
    assert.equal(nextFocusIndex(3, -1, true), 2);
    assert.equal(nextFocusIndex(3, 99, false), 0);
  });

  test("a single focusable element keeps focus on itself", () => {
    assert.equal(nextFocusIndex(1, 0, false), 0);
    assert.equal(nextFocusIndex(1, 0, true), 0);
  });

  test("nothing focusable: -1 (the dialog keeps focus)", () => {
    assert.equal(nextFocusIndex(0, -1, false), -1);
    assert.equal(nextFocusIndex(0, 0, true), -1);
    assert.equal(nextFocusIndex(NaN, 0, false), -1);
  });
});
