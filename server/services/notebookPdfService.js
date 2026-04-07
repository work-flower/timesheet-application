import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { getContent } from './notebookService.js';
import { getBrowser } from './puppeteerBrowser.js';

const PORT = process.env.PORT || 3001;
const ORIGIN = `http://127.0.0.1:${PORT}`;

// markdown-it instance with highlight.js wired in.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        return `<pre><code class="hljs language-${lang}">${out}</code></pre>`;
      } catch {
        // fall through to default escaping
      }
    }
    return `<pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

// Render internal markdown links (anything not http:// or https://) as plain
// text in PDF output. Source markdown is left untouched — only the renderer's
// behaviour changes. Clients receive a static document with no clickable
// references to internal resources. External links remain clickable.
const isExternalHref = (href) => /^https?:\/\//i.test(href || '');
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href');
  if (!isExternalHref(href)) return '';
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_close = (tokens, idx, options, env, self) => {
  // Find the matching link_open by scanning backwards.
  for (let i = idx - 1; i >= 0; i--) {
    if (tokens[i].type === 'link_open') {
      const href = tokens[i].attrGet('href');
      if (!isExternalHref(href)) return '';
      break;
    }
  }
  return self.renderToken(tokens, idx, options);
};

function buildHtml(markdown, baseHref, title) {
  const body = md.render(markdown);
  const safeTitle = (title || 'Notebook').replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <base href="${baseHref}">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="/api/assets/css/notebook-pdf-style.css">
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Build a notebook PDF buffer from its markdown content using Puppeteer.
 * Returns { buffer: Buffer }.
 */
export async function buildNotebookPdf(notebookId) {
  const rawContent = await getContent(notebookId);
  if (rawContent === null || rawContent === '') throw new Error('Notebook content not found');

  // Base href points at the notebook's media URL so relative image refs
  // (`![alt](image.png)`) resolve to the existing /notebooks/:id/:filename
  // route. Absolute paths in the wrapper (CSS, fonts) ignore the base path
  // and use only the scheme+host, so they continue to resolve to /api/assets.
  // Internal text links are flattened to plain text by the markdown-it
  // renderer rules above — source markdown is not modified.
  const baseHref = `${ORIGIN}/notebooks/${notebookId}/`;
  const html = buildHtml(rawContent, baseHref);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Wait for fonts to actually be applied (not just loaded over the network).
    await page.evaluateHandle('document.fonts.ready');

    const pdfBytes = await page.pdf({
      format: 'A4',
      margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="font-size:9px; width:100%; text-align:center; color:#888; font-family: sans-serif;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span>' +
        '</div>',
    });

    // Puppeteer v22+ returns a Uint8Array, not a Node Buffer. Express's
    // res.send() only treats Buffer as binary — a raw Uint8Array gets
    // JSON.stringify'd, producing a corrupted PDF download. Wrap explicitly.
    return { buffer: Buffer.from(pdfBytes) };
  } finally {
    await page.close().catch(() => {});
  }
}
