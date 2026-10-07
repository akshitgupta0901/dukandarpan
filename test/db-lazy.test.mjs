import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_MODULE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "db.mjs");

// Runs in a child process with DATABASE_URL forced to "" (which lib/env.mjs
// won't override from .env.local), so this behaves the same on a machine
// with or without a .env.local.
function runWithoutDatabaseUrl(code) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, DATABASE_URL: "" },
    encoding: "utf8",
  });
}

describe("lib/db.mjs connects lazily", () => {
  test("importing it does not throw when DATABASE_URL is missing", () => {
    const r = runWithoutDatabaseUrl(`await import(${JSON.stringify(DB_MODULE)}); console.log("imported");`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /imported/);
  });

  test("the first query throws the clear DATABASE_URL error", () => {
    const r = runWithoutDatabaseUrl(`
      const { sql } = await import(${JSON.stringify(DB_MODULE)});
      try { await sql\`SELECT 1\`; console.log("no error"); }
      catch (e) { console.log("ERR:" + e.message); }
    `);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ERR:DATABASE_URL is not set/);
  });

  test("sql.transaction and sql.query are also guarded, not undefined", () => {
    const r = runWithoutDatabaseUrl(`
      const { sql } = await import(${JSON.stringify(DB_MODULE)});
      for (const name of ["transaction", "query"]) {
        try { sql[name]([]); console.log(name + ": no error"); }
        catch (e) { console.log(name + ": " + e.message.slice(0, 30)); }
      }
    `);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /transaction: DATABASE_URL is not set/);
    assert.match(r.stdout, /query: DATABASE_URL is not set/);
  });
});
