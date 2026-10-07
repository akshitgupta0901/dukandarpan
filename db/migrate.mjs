
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "../lib/db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function stripLineComments(sqlText) {
  return sqlText
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

function splitStatements(sqlText) {
  return stripLineComments(sqlText)
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function appliedMigrations() {
  const rows = await sql`SELECT filename FROM schema_migrations`;
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(filename, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const statements = splitStatements(text);
  console.log(`  applying ${filename} (${statements.length} statement(s))...`);
  // sql.transaction() takes an array of query promises built from the SAME
  // sql function (don't await them individually first) and runs them as one
  // non-interactive Postgres transaction over a single HTTP request.
  await sql.transaction(statements.map((stmt) => sql.query(stmt)));
  await sql`INSERT INTO schema_migrations (filename) VALUES (${filename})`;
  console.log(`  ✓ ${filename}`);
}

async function main() {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found in db/migrations/.");
    return;
  }

  let ranAny = false;
  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`  skip ${filename} (already applied)`);
      continue;
    }
    await applyMigration(filename, path.join(MIGRATIONS_DIR, filename));
    ranAny = true;
  }

  console.log(ranAny ? "\nMigrations complete." : "\nNothing to do — schema already up to date.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
