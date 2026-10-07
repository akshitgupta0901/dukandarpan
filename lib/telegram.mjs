
import { loadEnv } from "./env.mjs";

loadEnv();

const TELEGRAM_API_BASE = "https://api.telegram.org";

export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN and/or TELEGRAM_CHAT_ID is not set (checked process.env and .env.local)"
    );
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Telegram request failed: HTTP ${res.status} ${res.statusText} (non-JSON response)`);
  }

  if (!res.ok || !json.ok) {
    throw new Error(`Telegram request failed: ${json.description || res.statusText}`);
  }

  return json;
}
