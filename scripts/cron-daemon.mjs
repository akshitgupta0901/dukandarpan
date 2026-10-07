
import cron from "node-cron";
import { runAllChecks } from "../lib/run-all-checks.mjs";

const SCHEDULE = "0 3 * * *"; // daily at 03:00 UTC -- keep in sync with vercel.json

console.log(`[cron-daemon] scheduled for "${SCHEDULE}" (UTC). Waiting... (Ctrl+C to stop)`);

cron.schedule(
  SCHEDULE,
  () => {
    console.log(`[cron-daemon] firing at ${new Date().toISOString()}`);
    runAllChecks({ triggeredBy: "cron" }).catch((err) => {
      console.error("[cron-daemon] run failed:", err);
    });
  },
  { timezone: "UTC" }
);
