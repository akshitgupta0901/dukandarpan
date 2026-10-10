/**
 * Tiny JSON viewer helpers (no library): pretty-print, split into lines, collapse
 * long output, and tokenize a line into highlightable pieces. Pure.
 *
 * The tokenizer works on text produced by JSON.stringify(value, null, 2), where a
 * string never spans lines, so each line is tokenized on its own and the tokens of
 * a line always join back into exactly that line. The viewer renders tokens as
 * React text nodes (never as HTML), so a payload can't inject markup.
 */

export const DEFAULT_COLLAPSE_LINES = 150;

export function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

/** @returns {{ lines: string[], totalLines: number, truncated: boolean }} the first `maxLines` lines of `text`. */
export function truncateLines(text, maxLines = DEFAULT_COLLAPSE_LINES) {
  const all = String(text ?? "").split("\n");
  const limit = Math.max(1, Math.floor(maxLines));
  return { lines: all.length > limit ? all.slice(0, limit) : all, totalLines: all.length, truncated: all.length > limit };
}

// string (optionally a key when a colon follows) | number | true/false | null | punctuation | whitespace | anything else
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}[\],:])|(\s+)|([^\s])/g;

/**
 * @param {string} line one line of pretty-printed JSON
 * @returns {Array<{ type: "key"|"string"|"number"|"boolean"|"null"|"punct"|"space"|"other", text: string }>}
 */
export function tokenizeLine(line) {
  const tokens = [];
  for (const m of String(line).matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        tokens.push({ type: "key", text: m[1] }, { type: "punct", text: m[2] });
      } else {
        tokens.push({ type: "string", text: m[1] });
      }
    } else if (m[3] !== undefined) tokens.push({ type: "number", text: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: "boolean", text: m[4] });
    else if (m[5] !== undefined) tokens.push({ type: "null", text: m[5] });
    else if (m[6] !== undefined) tokens.push({ type: "punct", text: m[6] });
    else if (m[7] !== undefined) tokens.push({ type: "space", text: m[7] });
    else tokens.push({ type: "other", text: m[8] });
  }
  return tokens;
}
