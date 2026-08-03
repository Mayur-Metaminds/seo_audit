/**
 * Format HTML/CSS/code snippets for readable display in the Solution modal.
 */

const STYLE_MAX = 280;
const SCRIPT_MAX = 200;
const LINE_SOFT_WRAP = 120;

/** Collapse noisy inline CSS/JS so SEO snippets stay readable. */
export function sanitizeSnippetNoise(code: string): string {
  return code
    // Drop Next.js runtime assets that pollute SEO evidence (chunks, CSS, preloads)
    .replace(/<link\b[^>]*>/gi, (tag) => {
      const t = tag.toLowerCase();
      if (/\/_next\//.test(t)) return "";
      if (/webpack-|polyfills-|main-app-/i.test(t)) return "";
      if (/rel=["'](?:preload|modulepreload|prefetch)["']/i.test(t)) return "";
      if (/rel=["']stylesheet["']/i.test(t)) return "";
      return tag;
    })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*(?:\/>|>[\s\S]*?<\/script>)/gi, (tag) => {
      if (/type=["']application\/ld\+json["']/i.test(tag)) return tag;
      if (/\/_next\//i.test(tag) || /src=["'][^"']*\.js/i.test(tag)) {
        return "";
      }
      return tag;
    })
    .replace(/<style(\s[^>]*)?>[\s\S]*?<\/style>/gi, (_m, attrs = "") => {
      const inner = _m.replace(/^<style[^>]*>/i, "").replace(/<\/style>$/i, "");
      if (inner.length <= STYLE_MAX) return _m;
      return `<style${attrs || ""}>\n  /* … ${inner.length} chars of CSS omitted (not needed for this SEO fix) … */\n</style>`;
    })
    .replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, (m, attrs = "") => {
      if (/type=["']application\/ld\+json["']/i.test(attrs || "")) return m;
      if (/\bsrc=/i.test(attrs || "")) return m;
      const inner = m.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
      if (!inner.trim() || inner.length <= SCRIPT_MAX) return m;
      return `<script${attrs || ""}>\n  /* … ${inner.length} chars of JS omitted … */\n</script>`;
    })
    .replace(/srcset="[^"]+"/g, 'srcset="..."')
    .replace(/data:image\/[^;]+;base64,[^"']+/g, "data:image/...")
    .replace(/\n{3,}/g, "\n\n");
}

function formatCssBlock(css: string, baseIndent: string): string {
  let out = css
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/\s+/g, " "))
    .replace(/\s*{\s*/g, " {\n")
    .replace(/\s*;\s*/g, ";\n")
    .replace(/\s*}\s*/g, "\n}\n")
    .replace(/,\s*/g, ",\n")
    .replace(/\n{3,}/g, "\n\n");

  const lines = out.split("\n");
  let depth = 0;
  const formatted: string[] = [];
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    // Keep custom properties readable on their own lines
    if (line.startsWith("}")) depth = Math.max(0, depth - 1);
    formatted.push(`${baseIndent}${"  ".repeat(depth)}${line}`);
    if (line.endsWith("{")) depth += 1;
  }
  return formatted.join("\n");
}

/**
 * Pretty-print HTML-ish snippets with indentation.
 * Keeps comments and +/- diff markers intact.
 */
export function formatCodeSnippet(input: string): string {
  if (!input?.trim()) return input;

  let code = sanitizeSnippetNoise(input);

  // If it looks like minified CSS-only (no tags), format as CSS
  if (!/<[a-zA-Z!/?]/.test(code) && /[{;}]/.test(code) && code.length > 80) {
    return formatCssBlock(code, "");
  }

  // Expand style tag contents when short enough to show
  code = code.replace(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi, (_m, attrs = "", css: string) => {
    const trimmed = css.trim();
    if (!trimmed || trimmed.startsWith("/* …")) {
      return `<style${attrs || ""}>\n${css}\n</style>`;
    }
    if (trimmed.length > STYLE_MAX) {
      return `<style${attrs || ""}>\n  /* … ${trimmed.length} chars of CSS omitted … */\n</style>`;
    }
    return `<style${attrs || ""}>\n${formatCssBlock(trimmed, "  ")}\n</style>`;
  });

  // Tokenize roughly into tags / text
  const parts = code.split(/(<\/?[^>]+>)/g).filter((p) => p.length > 0);
  const lines: string[] = [];
  let indent = 0;
  const voidTags = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
  ]);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Preserve leading +/- from diff lines that wrap a whole tag
    const diffPrefix = /^[+-]\s?/.test(part) ? part.match(/^[+-]\s?/)![0] : "";
    const content = diffPrefix ? part.replace(/^[+-]\s?/, "") : part;
    const t = content.trim();

    if (t.startsWith("<!--")) {
      lines.push(`${"  ".repeat(indent)}${diffPrefix}${t}`);
      continue;
    }

    const isClosing = /^<\//.test(t);
    const isComment = t.startsWith("<!");
    const tagMatch = t.match(/^<\/?([a-zA-Z0-9-]+)/);
    const tagName = tagMatch?.[1]?.toLowerCase() || "";
    const isSelfClosing = /\/>$/.test(t) || voidTags.has(tagName) || isComment;

    if (isClosing) indent = Math.max(0, indent - 1);

    // Break very long attribute lines softly
    let display = t;
    if (display.length > LINE_SOFT_WRAP && display.startsWith("<") && display.includes(" ")) {
      display = display
        .replace(/\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*="[^"]*")/g, "\n  $1")
        .replace(/\n\s*\/>$/, "\n/>")
        .replace(/\n\s*>$/, "\n>");
      const nested = display
        .split("\n")
        .map((ln, i) => (i === 0 ? `${"  ".repeat(indent)}${diffPrefix}${ln}` : `${"  ".repeat(indent)}  ${ln}`))
        .join("\n");
      lines.push(nested);
    } else if (!t.startsWith("<")) {
      // text node — keep CSS/code blocks intact; only soft-wrap plain prose
      const text = t;
      const looksLikeCode = /[{};]|--|toastify|function\s|=>/.test(text);
      if (!looksLikeCode && text.length > LINE_SOFT_WRAP) {
        const collapsed = text.replace(/\s+/g, " ");
        for (let i = 0; i < collapsed.length; i += LINE_SOFT_WRAP) {
          lines.push(`${"  ".repeat(indent)}${diffPrefix}${collapsed.slice(i, i + LINE_SOFT_WRAP)}`);
        }
      } else {
        for (const cssLine of text.split("\n")) {
          lines.push(`${"  ".repeat(indent)}${diffPrefix}${cssLine}`);
        }
      }
    } else {
      lines.push(`${"  ".repeat(indent)}${diffPrefix}${display}`);
    }

    if (!isClosing && !isSelfClosing && t.startsWith("<")) indent += 1;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
