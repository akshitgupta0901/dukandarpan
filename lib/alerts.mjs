
import { sql } from "./db.mjs";
import { sendTelegramMessage } from "./telegram.mjs";
import { evaluateAlert, formatTelegramText } from "./alert-rule.mjs";

export async function checkAndSendAlerts(snapshots, { sendFn = sendTelegramMessage } = {}) {
  const fired = [];

  for (const snap of snapshots) {
    const alert = evaluateAlert({
      previousFound: snap.previousFound,
      previousPosition: snap.previousPosition,
      found: snap.found,
      position: snap.position,
    });
    if (!alert) continue;

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

    const [row] = await sql`
      INSERT INTO alerts (
        business_id, query_id, snapshot_id, alert_type,
        previous_position, previous_found, new_position, new_found,
        message, telegram_sent, telegram_error
      )
      VALUES (
        ${snap.business_id}, ${snap.query_id}, ${snap.id}, ${alert.type},
        ${snap.previousPosition}, ${snap.previousFound}, ${snap.position}, ${snap.found},
        ${alert.message}, ${telegramSent}, ${telegramError}
      )
      RETURNING id, alert_type AS "alertType", message, created_at AS "createdAt"
    `;

    fired.push({ ...row, businessName: snap.businessName, telegramSent, telegramError });
  }

  return fired;
}
