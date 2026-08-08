import { parse } from 'node-html-parser';

/**
 * Server-side conversion of a raw page snapshot into compact markdown (the
 * client posts <main>'s outerHTML untouched — the deal is that ALL reduction
 * happens here, asynchronously, off the user's thread).
 *
 * Deterministic HTML→markdown, not HTML pruning: emitting text structures
 * makes Fluent UI's div pyramid vanish entirely (a pruned-HTML variant still
 * spent most of its tokens on bare wrapper tags) and, unlike prompted
 * conversion in the specialist, code cannot hallucinate a cell. Emitted
 * shapes:
 *   tables / role=grid → markdown tables (every row, cells pipe-escaped)
 *   headings           → #/##/… lines
 *   ul/ol              → "- " lines
 *   form controls      → [input: value] / [x] / [ ] markers, in document
 *                        order so the preceding Fluent Field label reads as
 *                        "Label" then "[input: value]" (values come from the
 *                        client's form-value sweep; passwords pre-masked)
 *   links              → [text](href) — hrefs carry record ids for follow-ups
 *   buttons            → [text] markers (available actions; bare text inside
 *                        table cells so sortable headers stay clean)
 *
 * Visibility is SYNTACTIC only: no layout engine, so we drop non-content
 * tags and aria-hidden subtrees; stylesheet-hidden content can leak through.
 * In this app that's the rare case — hidden chrome is aria-hidden or lives
 * outside <main>.
 */

const DROP_SELECTORS = ['script', 'style', 'template', 'noscript', 'svg', 'iframe', 'canvas', '[aria-hidden="true"]'];

// Rendered inline (flow into the current text line); anything else is a
// generic block container whose children render on their own lines.
const INLINE_TAGS = new Set(['SPAN', 'A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SMALL', 'CODE', 'LABEL', 'BUTTON', 'INPUT', 'SELECT', 'IMG', 'SUP', 'SUB', 'ABBR', 'TIME', 'MARK']);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const collapseWs = (s) => String(s).replace(/\s+/g, ' ').trim();
const escapeCell = (s) => s.replace(/\|/g, '\\|');

function attr(el, name) {
  return typeof el.getAttribute === 'function' ? el.getAttribute(name) : undefined;
}

function isTableLike(el) {
  if (el.tagName === 'TABLE') return true;
  const role = attr(el, 'role');
  return role === 'grid' || role === 'table' || role === 'treegrid';
}

function renderInput(el) {
  const type = (attr(el, 'type') || 'text').toLowerCase();
  if (type === 'hidden') return ''; // not user-visible (form-tracker scan inputs)
  if (type === 'checkbox' || type === 'radio') {
    return attr(el, 'checked') != null ? '[x]' : '[ ]';
  }
  const value = attr(el, 'value');
  return `[input: ${collapseWs(value || '') || '(empty)'}]`;
}

/** Single-line rendering — used for table cells, labels, list items. */
function renderInline(el, { plainButtons = false } = {}) {
  const parts = [];
  for (const child of el.childNodes || []) {
    if (child.nodeType === TEXT_NODE) {
      parts.push(child.text);
    } else if (child.nodeType === ELEMENT_NODE) {
      parts.push(renderInlinePiece(child, { plainButtons }));
    }
  }
  return collapseWs(parts.filter(Boolean).join(' '));
}

function renderInlinePiece(el, opts) {
  const tag = el.tagName;
  const role = attr(el, 'role');
  if (tag === 'INPUT') return renderInput(el);
  if (tag === 'TEXTAREA') return `[input: ${renderInline(el, opts) || '(empty)'}]`;
  if (tag === 'SELECT') return `[input: ${collapseWs(attr(el, 'value') || '') || '(empty)'}]`;
  if (tag === 'IMG') {
    const alt = collapseWs(attr(el, 'alt') || '');
    return alt ? `(image: ${alt})` : '';
  }
  if (tag === 'BUTTON' || role === 'button' || role === 'combobox' || role === 'menuitem' || role === 'tab') {
    const text = renderInline(el, opts) || collapseWs(attr(el, 'aria-label') || '');
    if (!text) return '';
    // The selected tab is the one whose panel content follows in the snapshot.
    const selected = role === 'tab' && attr(el, 'aria-selected') === 'true' ? ' (selected)' : '';
    return opts.plainButtons ? text + selected : `[${text}${selected}]`;
  }
  if (tag === 'A') {
    const text = renderInline(el, opts);
    const href = attr(el, 'href');
    if (!text) return '';
    return href ? `[${text}](${href})` : text;
  }
  // Nested block-ish content inside an inline context (rare) flattens to text.
  return renderInline(el, opts);
}

function renderTable(el) {
  const rows = [];
  for (const rowEl of el.querySelectorAll('tr, [role="row"]')) {
    const cells = rowEl
      .querySelectorAll('th, td, [role="columnheader"], [role="gridcell"], [role="cell"], [role="rowheader"]')
      .map((cell) => escapeCell(renderInline(cell, { plainButtons: true })));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const line = (r) => `| ${pad(r).join(' | ')} |`;
  const [header, ...body] = rows;
  return [line(header), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(line)].join('\n');
}

function renderList(el) {
  const items = [];
  for (const li of el.childNodes || []) {
    if (li.nodeType !== ELEMENT_NODE) continue;
    if (li.tagName === 'LI') {
      const text = renderInline(li);
      if (text) items.push(`- ${text}`);
    }
  }
  return items.join('\n');
}

/** Block rendering: text runs and inline pieces accumulate onto one line;
 *  block children flush the run and emit their own lines. */
function renderChildren(el) {
  const blocks = [];
  let run = [];
  const flush = () => {
    const text = collapseWs(run.filter(Boolean).join(' '));
    if (text) blocks.push(text);
    run = [];
  };

  for (const child of el.childNodes || []) {
    if (child.nodeType === TEXT_NODE) {
      run.push(child.text);
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    const tag = child.tagName;

    if (tag === 'BR') { flush(); continue; }
    if (tag === 'HR') { flush(); blocks.push('---'); continue; }
    if (isTableLike(child)) { flush(); blocks.push(renderTable(child)); continue; }
    if (/^H[1-6]$/.test(tag || '')) {
      flush();
      const text = renderInline(child);
      if (text) blocks.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
      continue;
    }
    if (tag === 'UL' || tag === 'OL') { flush(); blocks.push(renderList(child)); continue; }
    if (tag === 'TEXTAREA') { flush(); blocks.push(`[input: ${renderInline(child) || '(empty)'}]`); continue; }
    if (INLINE_TAGS.has(tag)) { run.push(renderInlinePiece(child, {})); continue; }

    // Generic block container.
    flush();
    const inner = renderChildren(child);
    if (inner) blocks.push(inner);
  }
  flush();
  return blocks.filter(Boolean).join('\n');
}

/** Last-resort text extraction when parsing fails — never throws. */
function plainTextFallback(rawHtml) {
  return String(rawHtml)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripPageHtml(rawHtml) {
  try {
    const root = parse(String(rawHtml)); // comments are dropped by default
    for (const selector of DROP_SELECTORS) {
      for (const el of root.querySelectorAll(selector)) el.remove();
    }
    const out = renderChildren(root).replace(/\n{3,}/g, '\n\n').trim();
    return out || plainTextFallback(rawHtml);
  } catch (err) {
    console.warn(`Page content strip failed (${err.message}) — falling back to plain text`);
    return plainTextFallback(rawHtml);
  }
}
