import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { authorizeAdmin } from "../lib/admin-auth.mjs";

describe("authorizeAdmin", () => {
  test("correct key: allowed", () => {
    assert.deepEqual(authorizeAdmin({ provided: "s3cret", expected: "s3cret", nodeEnv: "production" }), { ok: true });
  });

  test("missing key when one is configured: 401", () => {
    const r = authorizeAdmin({ provided: null, expected: "s3cret", nodeEnv: "production" });
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
  });

  test("wrong key (including a different length): 401", () => {
    for (const provided of ["nope", "s3cret!", "", "s3cre"]) {
      const r = authorizeAdmin({ provided, expected: "s3cret", nodeEnv: "production" });
      assert.equal(r.ok, false, `"${provided}" should be rejected`);
      assert.equal(r.status, 401);
    }
  });

  test("error messages never contain the configured key", () => {
    const r = authorizeAdmin({ provided: "guess", expected: "s3cret-value", nodeEnv: "production" });
    assert.doesNotMatch(r.error, /s3cret-value/);
  });

  test("no key configured in production: closed (503), even if the caller sends one", () => {
    for (const provided of [null, "anything"]) {
      const r = authorizeAdmin({ provided, expected: undefined, nodeEnv: "production" });
      assert.equal(r.ok, false);
      assert.equal(r.status, 503);
    }
  });

  test("no key configured in development or test: open, so local dev needs no setup", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      assert.deepEqual(authorizeAdmin({ provided: null, expected: undefined, nodeEnv }), { ok: true });
    }
  });

  test("an empty ADMIN_KEY counts as not configured", () => {
    assert.equal(authorizeAdmin({ provided: null, expected: "", nodeEnv: "production" }).status, 503);
  });
});
