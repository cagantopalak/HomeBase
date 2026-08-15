// What a tool is allowed to write into a URL field.
//
// The new tab page is the surface the user clicks most, so a tool that can put a URL on it
// is a target worth taking seriously. Anything that reaches these tools may have come from
// text the model was asked to summarise, so the scheme is checked here rather than trusted.

// A tile is navigated to when it is clicked. Only the two schemes a link should have.
const LINK_SCHEMES = ["http:", "https:"];

// Icons and backgrounds are rendered as images and never navigated to, so an inline image
// is safe. That is also the form the extension itself stores a chosen background in.
const IMAGE_DATA = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|avif);/i;

function parse(value) {
  try {
    return new URL(String(value));
  } catch (err) {
    return null;
  }
}

function isBlockedScheme(value) {
  const text = String(value).trim().toLowerCase();
  return text.startsWith("javascript:") || text.startsWith("vbscript:");
}

// Throws with a message the model can act on rather than returning a bare false.
function assertLinkUrl(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  if (isBlockedScheme(text)) {
    throw new Error(`${field} may not use a script scheme`);
  }
  const url = parse(text);
  if (!url || !LINK_SCHEMES.includes(url.protocol)) {
    throw new Error(`${field} must be an http or https URL, got "${text.slice(0, 60)}"`);
  }
  return text;
}

function assertImageUrl(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  if (isBlockedScheme(text)) {
    throw new Error(`${field} may not use a script scheme`);
  }
  if (IMAGE_DATA.test(text)) return text;
  const url = parse(text);
  if (!url || !LINK_SCHEMES.includes(url.protocol)) {
    throw new Error(
      `${field} must be an http or https URL, or a data:image/... URL, got "${text.slice(0, 60)}"`
    );
  }
  return text;
}

module.exports = { assertLinkUrl, assertImageUrl, isBlockedScheme, LINK_SCHEMES };
