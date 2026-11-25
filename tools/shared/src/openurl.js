// Which addresses the editors open from `?open=` (F22.1a follow-up; same idea as F25.2's `data-circuit` rule).
//   openableUrl(value, base, origin) -> { url } or { error }
// Accepted: a file of this site (same origin, https or http as the page is), or a blob: address whose origin is this one (the
// logic tools' "Send to Figure Editor" makes one). Refused: another origin, another scheme (data:, javascript:, file:), a blob: of
// another origin or of an opaque one, a login in the address, an empty value. No DOM; the caller passes location.origin.

const REFUSED = "only a file of this site, or a link this site made, can be opened by link";

export function openableUrl(value, base, origin) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { error: `nothing to open: ${REFUSED}` };
  let url;
  try { url = new URL(text, base); } catch { return { error: `"${text}" is not an address: ${REFUSED}` }; }
  const schemeOk = url.protocol === "https:" || url.protocol === "http:" || url.protocol === "blob:";
  // For blob: the URL's origin is the origin that made it ("null" when opaque).
  if (!schemeOk || url.origin !== origin || url.username || url.password) return { error: `"${text}" is not on this site: ${REFUSED}` };
  return { url };
}
