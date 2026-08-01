/**
 * Provider payload template engine.
 *
 * Renders a declarative JSON request template against a neutral chat context.
 * Deliberately NOT Turing-complete: plain placeholder substitution plus one
 * bounded iteration construct for the message array.
 *
 * Placeholder syntax (inside string values):
 *   {{$.path.to.value}}  — resolved from the root context
 *   {{$m.path}}          — resolved from the current message (inside $forEachMessage)
 *
 * A string that is EXACTLY one placeholder resolves to the raw value (number,
 * array, object…); placeholders embedded in a longer string interpolate as text.
 *
 * Bounded iteration: an object node of the form
 *   { "$forEachMessage": { "user": {...}, "assistant": {...}, "tool": {...} } }
 * is replaced by an array with one rendered sub-template per context message,
 * chosen by the message's role. Messages whose role has no sub-template are
 * skipped. When the node appears as an ELEMENT of an array (e.g. after a fixed
 * system message), its rendered messages are spliced into the parent array —
 *   "messages": [ {role:"system", content:"{{$.system}}"}, { "$forEachMessage": {...} } ]
 * flattens to a single messages array (the OpenAI / Gemini shape).
 */

const PLACEHOLDER = /\{\{\s*(\$m?(?:\.[\w-]+)*)\s*\}\}/g;
const EXACT_PLACEHOLDER = /^\{\{\s*(\$m?(?:\.[\w-]+)*)\s*\}\}$/;

function resolvePath(root, message, expr) {
  const [head, ...segments] = expr.split('.');
  let current = head === '$m' ? message : root;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function renderString(str, context, message) {
  const exact = str.match(EXACT_PLACEHOLDER);
  if (exact) {
    const value = resolvePath(context, message, exact[1]);
    return value === undefined ? null : value;
  }
  return str.replace(PLACEHOLDER, (_, expr) => {
    const value = resolvePath(context, message, expr);
    return value == null ? '' : String(value);
  });
}

function isForEachNode(node) {
  return (
    node && typeof node === 'object' && !Array.isArray(node)
    && Object.keys(node).length === 1 && node.$forEachMessage !== undefined
  );
}

function renderForEach(node, context) {
  const roleTemplates = node.$forEachMessage || {};
  const messages = Array.isArray(context.messages) ? context.messages : [];
  const out = [];
  for (const msg of messages) {
    const roleTemplate = roleTemplates[msg.role];
    if (roleTemplate === undefined) continue;
    out.push(renderNode(roleTemplate, context, msg));
  }
  return out;
}

function renderNode(node, context, message) {
  if (typeof node === 'string') return renderString(node, context, message);
  if (Array.isArray(node)) {
    // Splice $forEachMessage results into the parent array (system-then-messages).
    const out = [];
    for (const item of node) {
      if (isForEachNode(item)) out.push(...renderForEach(item, context));
      else out.push(renderNode(item, context, message));
    }
    return out;
  }
  if (node && typeof node === 'object') {
    if (isForEachNode(node)) return renderForEach(node, context);
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = renderNode(value, context, message);
    }
    return out;
  }
  return node;
}

/** Render a request template object against the neutral chat context. */
export function renderTemplate(template, context) {
  return renderNode(template, context, null);
}

// Invisible Unicode that rides along with copy-pasted keys/values: zero-width
// space/joiners (U+200B-D), word joiner (U+2060), BOM (U+FEFF), soft hyphen
// (U+00AD). Never intentional in a header value.
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;

/** HTTP header values must be Latin-1 (ByteString). Strip invisible characters
 *  silently, turn non-breaking spaces into plain spaces, and fail with a
 *  NAMED, positioned error for anything else >0xFF - fetch()'s own "Cannot
 *  convert argument to a ByteString" is undebuggable. */
function sanitizeHeaderValue(name, value) {
  const cleaned = String(value).replace(INVISIBLE_CHARS, '').replace(/\u00A0/g, ' ').trim();
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (code > 0xff) {
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      throw new Error(
        `Header "${name}" contains a non-Latin-1 character (U+${hex}) at position ${i} - likely pasted invisibly. Re-type the value (or the API key) by hand.`,
      );
    }
  }
  return cleaned;
}


export function renderHeaders(headers, context) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const rendered = typeof value === 'string' ? String(renderString(value, context, null)) : value;
    out[key] = typeof rendered === 'string' ? sanitizeHeaderValue(key, rendered) : rendered;
  }
  return out;
}

/** Extract a value from a response object via a dot path (e.g. "content.0.text"). */
export function extractPath(obj, path) {
  if (!path) return undefined;
  let current = obj;
  for (const segment of path.split('.')) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}
