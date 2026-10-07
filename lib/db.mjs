import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./env.mjs";

loadEnv();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (Neon connection string, " +
      "as already saved there) or set it in your environment / deploy platform."
  );
}

export const sql = neon(process.env.DATABASE_URL);
