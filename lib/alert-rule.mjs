

const RANK_DROP_THRESHOLD = 3;

export function evaluateAlert({ previousFound, previousPosition, found, position }) {
  if (previousFound === null || previousFound === undefined) {
    return null; // first-ever check for this business -- nothing to compare against
  }

  if (previousFound === true && found === false) {
    return {
      type: "fell_out",
      message: `fell out of the local pack (was #${previousPosition})`,
    };
  }

  if (previousFound === true && found === true) {
    const drop = position - previousPosition;
    if (drop >= RANK_DROP_THRESHOLD) {
      return {
        type: "rank_drop",
        message: `dropped from #${previousPosition} to #${position} (down ${drop})`,
      };
    }
  }

  // not_found -> not_found (still down, already alerted on the original
  // transition) and not_found -> found (recovery) both fall through here:
  // neither is a drop event.
  return null;
}


/** "X just outranked you (you are now #5, they are #4)" -- the message stored with an "overtaken" alert. */
export function formatOvertakeMessage({ competitorName, yourPosition, theirPosition }) {
  return `${competitorName} just outranked you (you are now #${yourPosition}, they are #${theirPosition})`;
}

// Telegram's legacy Markdown treats _ * ` [ as formatting; a stray one in a business or
// query name makes the whole message fail with "can't parse entities". Backslash-escape them.
export function escapeTelegramMarkdown(text) {
  return String(text).replace(/([_*`\[])/g, "\\$1");
}

const TELEGRAM_EMOJI = {
  fell_out: "\u{1F6A8}", // 🚨
  rank_drop: "\u{1F53B}", // 🔻
  overtaken: "\u{26A0}\u{FE0F}", // ⚠️
};

export function formatTelegramText({ businessName, queryText, category, type, message }) {
  const emoji = TELEGRAM_EMOJI[type] ?? TELEGRAM_EMOJI.rank_drop;
  const e = escapeTelegramMarkdown;
  return `${emoji} *${e(businessName)}*\n${e(message)}\nQuery: "${e(queryText)}" (${e(category)})`;
}
