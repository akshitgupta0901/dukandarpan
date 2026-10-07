
import { runAllChecks } from "../lib/run-all-checks.mjs";

runAllChecks({ triggeredBy: "manual" })
  .then((result) => {
    console.log(
      `\nRun ${result.runRowId} (${result.runDate}): ${result.successCount}/${result.queries.length} succeeded, ` +
        `${result.serpApiCallsMade} SerpApi call(s) used, ${result.alertsFired ?? 0} alert(s) fired\n`
    );
    console.table(
      result.queries.map((q) => ({
        category: q.category,
        query: q.queryText,
        status: q.status,
        attempts: q.attempts,
        snapshots: q.snapshotCount ?? "-",
        alerts: q.alertsFired ?? "-",
        error: q.error ?? "-",
      }))
    );
  })
  .catch((err) => {
    console.error("runAllChecks failed:", err);
    process.exit(1);
  });
