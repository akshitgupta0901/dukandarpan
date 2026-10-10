/**
 * Secret redaction for SerpApi payloads -- pure, zero I/O.
 *
 * SerpApi does not echo the api_key back (no stored payload or fixture contains one), but nothing
 * here relies on that. redactSecrets drops any api_key property, scrubs api_key= URL parameters,
 * and masks the configured key values wherever they appear. It is applied both when a response
 * is SAVED (lib/raw-store.mjs) and when it is SHOWN (lib/raw-data.mjs), so a key can't be
 * stored or displayed even if a future SerpApi response did include one.
 */

export const REDACTED = "[redacted]";
const KEY_PROPERTY = /^api[_-]?key$/i;
const KEY_PARAM = /([?&;]api[_-]?key=)[^&#\s"']*/gi;

function redactString(text, secrets) {
  let out = text.replace(KEY_PARAM, `$1${REDACTED}`);
  for (const secret of secrets) {
    if (secret && out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  return out;
}

/** A deep copy of `value` with every secret removed (see the module comment). Pure. */
export function redactSecrets(value, secrets = []) {
  const keys = secrets.map((s) => String(s ?? "").trim()).filter((s) => s.length >= 8); // too-short strings would mangle ordinary text
  const walk = (v) => {
    if (typeof v === "string") return redactString(v, keys);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (KEY_PROPERTY.test(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}
