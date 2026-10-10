/**
 * Keyboard navigation for a tab list (the View SerpApi Data modal's Maps / Organic tabs) -- pure.
 * Left/Right move to the previous/next tab and wrap, Home/End jump to the ends. Any other key is not ours.
 *
 * @returns {number|null} the index to select, or null when the key isn't a tab-navigation key
 */
export function nextTabIndex(count, current, key) {
  if (!Number.isInteger(count) || count <= 0) return null;
  const at = Number.isInteger(current) && current >= 0 && current < count ? current : 0;
  switch (key) {
    case "ArrowRight":
      return (at + 1) % count;
    case "ArrowLeft":
      return (at - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
