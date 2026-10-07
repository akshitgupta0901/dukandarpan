// Client-side fetch wrapper that always throws a readable message. Without it,
// an HTML error page from the server (e.g. a Next.js 404/500 page) surfaces as
// the raw `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
export const LOAD_ERROR_MESSAGE = "Couldn't load data, try again";

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {string} [fallbackError] shown when the response isn't usable JSON
 *   or the request itself fails. A JSON `{ error }` body from our own API
 *   routes still wins, since those messages are written for the user.
 */
export async function fetchJson(url, options, fallbackError = LOAD_ERROR_MESSAGE) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error(fallbackError);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(fallbackError);
  }

  if (!res.ok) throw new Error(json?.error || fallbackError);
  return json;
}
