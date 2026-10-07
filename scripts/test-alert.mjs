
import { evaluateAlert, formatTelegramText } from "../lib/alert-rule.mjs";
import { sendTelegramMessage } from "../lib/telegram.mjs";


const fakeTransition = {
  businessName: "Zaitoon Restaurant",
  queryText: "restaurant near VIT Vellore",
  category: "restaurant",
  previousFound: true,
  previousPosition: 1,
  found: true,
  position: 5,
};

const alert = evaluateAlert(fakeTransition);
if (!alert) {
  console.error(
    "The fabricated scenario above didn't trip the alert rule (evaluateAlert returned null) -- " +
      "nothing to send. Check fakeTransition's numbers against lib/alert-rule.mjs."
  );
  process.exit(1);
}

const text = formatTelegramText({
  businessName: fakeTransition.businessName,
  queryText: fakeTransition.queryText,
  category: fakeTransition.category,
  type: alert.type,
  message: alert.message,
});

console.log(`Rule fired: ${alert.type} -- "${alert.message}"\n`);
console.log("Sending this exact text via the real lib/telegram.mjs sendTelegramMessage():\n");
console.log("----------------------------------------");
console.log(text);
console.log("----------------------------------------\n");

try {
  await sendTelegramMessage(text);
  console.log("Sent. Check Telegram for a message from your bot -- no DB rows were touched.");
} catch (err) {
  console.error("Telegram send failed:", err.message);
  console.error("Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local.");
  process.exit(1);
}
