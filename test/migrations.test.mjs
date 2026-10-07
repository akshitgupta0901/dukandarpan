import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(ROOT, "db", "migrations");
const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

// db/migrate.mjs strips "--" line comments and splits on ";", so a "--" or ";"
// inside a string literal would silently corrupt a statement.
function stripLineComments(sqlText) {
  return sqlText
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

describe("migration files", () => {
  test("are numbered consecutively from 0001", () => {
    files.forEach((f, i) => assert.match(f, new RegExp(`^${String(i + 1).padStart(4, "0")}_`), `${f} is out of sequence`));
  });

  for (const file of files) {
    const raw = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");

    test(`${file}: no "--" or ";" inside a string literal (migrate.mjs would split it)`, () => {
      for (const line of raw.split("\n")) {
        const idx = line.indexOf("--");
        const beforeComment = idx === -1 ? line : line.slice(0, idx);
        const quotes = (beforeComment.match(/'/g) ?? []).length;
        assert.equal(quotes % 2, 0, `unterminated string on a line with "--" in ${file}: ${line}`);
      }
      const literals = stripLineComments(raw).match(/'[^']*'/g) ?? [];
      for (const lit of literals) assert.doesNotMatch(lit, /;|--/, `${file}: literal ${lit} contains ; or --`);
    });

    test(`${file}: additive and re-runnable`, () => {
      const code = stripLineComments(raw);
      assert.doesNotMatch(code, /\bDROP\s+(TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i, `${file} is destructive`);
      for (const stmt of code.split(";").map((s) => s.trim()).filter(Boolean)) {
        if (/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)/i.test(stmt)) assert.match(stmt, /IF NOT EXISTS/i, `${file}: ${stmt.slice(0, 60)}`);
        if (/ADD\s+COLUMN/i.test(stmt)) {
          const adds = stmt.match(/ADD\s+COLUMN[^,]*/gi);
          for (const a of adds) assert.match(a, /IF NOT EXISTS/i, `${file}: ${a}`);
        }
      }
    });
  }
});

describe("db/seed-demo.mjs --dry-run", () => {
  test("prints a summary and needs no DATABASE_URL", () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "db", "seed-demo.mjs"), "--dry-run"], {
      env: { ...process.env, DATABASE_URL: "" },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Brew & Bloom Cafe \(hero\)/);
    assert.match(r.stdout, /--dry-run: nothing was written/);
  });
});
