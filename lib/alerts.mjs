
import { sql } from "./db.mjs";
import { sendTelegramMessage } from "./telegram.mjs";
import { evaluateAlert, formatTelegramText, formatOvertakeMessage } from "./alert-rule.mjs";

async function insertAlertRow(row) {
  const [inserted] = await sql`
    INSERT INTO alerts (
      business_id, query_id, snapshot_id, alert_type,
      previous_position, previous_found, new_position, new_found,
      message, telegram_sent, telegram_error, competitor_name
    )
    VALUES (
      ${row.business_id}, ${row.query_id}, ${row.snapshot_id}, ${row.alert_type},
      ${row.previous_position}, ${row.previous_found}, ${row.new_position}, ${row.new_found},
      ${row.message}, ${row.telegram_sent}, ${row.telegram_error}, ${row.competitor_name}
    )
    RETURNING id, alert_type AS "alertType", message, created_at AS "createdAt"
  `;
  return inserted;
}

/**
 * The alerts one snapshot should raise: at most one rank alert (a drop of 3+ or
 * falling out of the pack) plus any "overtaken" alerts runCheck attached as
 * snap.overtakes (already capped, see lib/overtake.mjs).
 */
function alertsForSnapshot(snap) {
  const planned = [];

  const rank = evaluateAlert({
    previousFound: snap.previousFound,
    previousPosition: snap.previousPosition,
    found: snap.found,
    position: snap.position,
  });
  if (rank) {
    planned.push({
      type: rank.type,
      message: rank.message,
      competitorName: null,
      previousPosition: snap.previousPosition,
      previousFound: snap.previousFound,
      newPosition: snap.position,
      newFound: snap.found,
    });
  }

  for (const o of snap.overtakes ?? []) {
    planned.push({
      type: "overtaken",
      message: formatOvertakeMessage({ competitorName: o.competitor, yourPosition: o.yourPosition, theirPosition: o.position }),
      competitorName: o.competitor,
      previousPosition: o.yourPreviousPosition,
      previousFound: true,
      newPosition: o.yourPosition,
      newFound: true,
    });
  }
  return planned;
}

export async function checkAndSendAlerts(snapshots, { sendFn = sendTelegramMessage, insertFn = insertAlertRow } = {}) {
  const fired = [];

  for (const snap of snapshots) {
    for (const alert of alertsForSnapshot(snap)) {
      const text = formatTelegramText({
        businessName: snap.businessName,
        queryText: snap.queryText,
        category: snap.category,
        type: alert.type,
        message: alert.message,
      });

      let telegramSent = false;
      let telegramError = null;
      try {
        await sendFn(text);
        telegramSent = true;
      } catch (err) {
        telegramError = err.message;
        console.warn(`[alerts] Telegram delivery failed for business ${snap.business_id}: ${err.message}`);
      }

      const row = await insertFn({
        business_id: snap.business_id,
        query_id: snap.query_id,
        snapshot_id: snap.id,
        alert_type: alert.type,
        previous_position: alert.previousPosition,
        previous_found: alert.previousFound,
        new_position: alert.newPosition,
        new_found: alert.newFound,
        message: alert.message,
        telegram_sent: telegramSent,
        telegram_error: telegramError,
        competitor_name: alert.competitorName,
      });

      fired.push({ ...row, businessName: snap.businessName, competitorName: alert.competitorName, telegramSent, telegramError });
    }
  }

  return fired;
}
