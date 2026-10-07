import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./env.mjs";

loadEnv();

let client = null;

// The connection is created on first use, not on import, so modules that only
// import `sql` (and tests that swap in doubles) load without DATABASE_URL set.
// A missing URL therefore throws at the query, where API routes catch it and
// return a JSON error, instead of crashing the whole module import.
function getClient() {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Add it to .env.local (Neon connection string, " +
          "as already saved there) or set it in your environment / deploy platform."
      );
    }
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

// Behaves like neon()'s `sql`: callable as a tagged template, plus
// sql.transaction(...) and sql.query(...). The cast keeps neon's own types
// (without it editors treat `await sql`...`` as awaiting a plain function).
export const sql = /** @type {ReturnType<typeof neon>} */ (
  new Proxy(function sql() {}, {
    apply(_target, _thisArg, args) {
      return getClient()(...args);
    },
    get(_target, prop) {
      const c = getClient();
      const value = c[prop];
      return typeof value === "function" ? value.bind(c) : value;
    },
  })
);
