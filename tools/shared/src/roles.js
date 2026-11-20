// Colour roles for figures (CLAUDE.md, VISION.md section 7): themes/ is the only place colours are set, and figures use
// the universal theme, published by custom.scss as --fig-* CSS properties (--fig-dark-* for a dark canvas). Code asks
// for a role, never a colour. Without a page (tests, Deno), there is no theme: the result is undefined, and a caller
// either passes the colours it wants or draws in currentColor.

/** The colour of figure role `name` ("ink", "accent", ...) in the page's theme, or undefined. */
export function figureRole(name, { dark = false } = {}) {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--fig-${dark ? "dark-" : ""}${name}`).trim();
  return value || undefined;
}
