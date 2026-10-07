

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


export function formatTelegramText({ businessName, queryText, category, type, message }) {
  const emoji = type === "fell_out" ? "\u{1F6A8}" : "\u{1F53B}"; // 🚨 / 🔻
  return `${emoji} *${businessName}*\n${message}\nQuery: "${queryText}" (${category})`;
}
