import MDEditor from '@uiw/react-md-editor';
import rehypeSanitize from 'rehype-sanitize';

/**
 * Markdown renderer for UNTRUSTED content.
 *
 * `MDEditor.Markdown` hardcodes `rehype-raw`, so raw HTML embedded in the
 * markdown source is rendered as live HTML (and `skipHtml` is ignored by that
 * component). Any content that is NOT authored by a trusted party — AI/assistant
 * output, AI recaps/briefings synthesised from external tickets/calendars/bank
 * data, user notes — must therefore be sanitised before rendering, or it becomes
 * an XSS sink.
 *
 * SafeMarkdown injects `rehype-sanitize` (which runs after the built-in
 * `rehype-raw`) to strip scripts, event handlers and unsafe URLs against a safe
 * allowlist, while preserving ordinary markdown and code blocks. It is a drop-in
 * replacement for `MDEditor.Markdown` — forward `source`, `style`, etc. as usual.
 *
 * Use this everywhere untrusted content is shown. Trusted, author-controlled
 * content (e.g. Help topics) may use `MDEditor.Markdown` directly.
 */
export default function SafeMarkdown({ rehypePlugins = [], ...props }) {
  return <MDEditor.Markdown {...props} rehypePlugins={[[rehypeSanitize], ...rehypePlugins]} />;
}
