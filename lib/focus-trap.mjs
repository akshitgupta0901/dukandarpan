/**
 * Keyboard focus trapping for the modal (pure part). Given how many focusable
 * elements the dialog has and which one is focused, where does Tab / Shift+Tab go?
 * Focus wraps around inside the dialog and never escapes to the page behind it.
 *
 * @param {number} count number of focusable elements in the dialog
 * @param {number} currentIndex index of the focused one, or -1 if focus is on the dialog itself / outside it
 * @param {boolean} shiftKey
 * @returns {number} the index to focus, or -1 when there is nothing focusable (keep focus on the dialog)
 */
export function nextFocusIndex(count, currentIndex, shiftKey) {
  if (!Number.isInteger(count) || count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) return shiftKey ? count - 1 : 0;
  return shiftKey ? (currentIndex - 1 + count) % count : (currentIndex + 1) % count;
}

// Elements Tab can reach. tabindex="-1" ones (the dialog itself, the inactive tabs of a roving-tabindex
// tab list) are focusable by script but are NOT part of the Tab order, so they are excluded.
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
]
  .map((sel) => `${sel}:not([tabindex="-1"])`)
  .join(",");
