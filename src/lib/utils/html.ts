import * as cheerio from "cheerio";

export function parseHtml(html: string) {
  return cheerio.load(html);
}

export function getTextContent($: cheerio.CheerioAPI, selector: string): string {
  return $(selector).first().text().trim();
}

export function getMetaContent($: cheerio.CheerioAPI, name: string): string {
  return (
    $(`meta[name="${name}"]`).attr("content") ||
    $(`meta[property="${name}"]`).attr("content") ||
    ""
  ).trim();
}

export function getRobotsMeta($: cheerio.CheerioAPI): string {
  return getMetaContent($, "robots").toLowerCase();
}

export function getCanonical($: cheerio.CheerioAPI): string {
  // Match rel token case-insensitively (rel="canonical", REL="CANONICAL", multi-value rel)
  let href = "";
  $("link[rel]").each((_, el) => {
    if (href) return;
    const relTokens = ($(el).attr("rel") || "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (relTokens.includes("canonical")) {
      const value = $(el).attr("href")?.trim();
      if (value) href = value;
    }
  });
  return href;
}

/** Regex fallback when the HTML parser misses a present tag (order/attribute quirks). */
export function extractCanonicalFromHtml(html: string | undefined | null): string {
  if (!html) return "";
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const tag = m[0];
    if (!/\bcanonical\b/i.test(tag) || !/\bhref\s*=/i.test(tag)) continue;
    const relMatch =
      tag.match(/\brel\s*=\s*["']([^"']*)["']/i) || tag.match(/\brel\s*=\s*([^\s>/"']+)/i);
    if (!relMatch) continue;
    const tokens = relMatch[1]
      .toLowerCase()
      .replace(/["']/g, "")
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!tokens.includes("canonical")) continue;
    const hrefMatch =
      tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || tag.match(/\bhref\s*=\s*([^\s>]+)/i);
    if (hrefMatch?.[1]) return hrefMatch[1].replace(/["']/g, "").trim();
  }
  return "";
}

/** HTTP Link: <https://example.com/page>; rel="canonical" */
export function extractCanonicalFromHeaders(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  const link = headers["link"] || headers["Link"] || "";
  if (!link) return "";
  const parts = link.split(/,(?=\s*<)/);
  for (const part of parts) {
    if (!/rel\s*=\s*["']?canonical["']?/i.test(part)) continue;
    const m = part.match(/<\s*([^>\s]+)\s*>/);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

/**
 * Resolve canonical with multiple sources so view-source truth is not lost
 * after headless re-render or odd parsers.
 */
export function resolvePageCanonical(page: {
  html: string;
  rawHtml?: string;
  headers?: Record<string, string>;
}): string {
  const sources = [page.rawHtml, page.html].filter(Boolean) as string[];
  for (const html of sources) {
    const $ = parseHtml(html);
    const viaDom = getCanonical($);
    if (viaDom) return viaDom;
    const viaRegex = extractCanonicalFromHtml(html);
    if (viaRegex) return viaRegex;
  }
  return extractCanonicalFromHeaders(page.headers);
}

/**
 * DOM for head-level SEO should prefer HTTP HTML (matches browser view-source).
 * Rendered DOM is better for body content after client JS.
 */
export function getSeoHeadDocument(page: { html: string; rawHtml?: string }): cheerio.CheerioAPI {
  if (page.rawHtml && page.rawHtml.length > 50) {
    return parseHtml(page.rawHtml);
  }
  return parseHtml(page.html);
}

export function getTitle($: cheerio.CheerioAPI): string {
  // Prefer document title in <head> — SVG <title> nodes must not win
  const headTitle = $("head title").first().text().trim();
  if (headTitle) return headTitle;
  const docTitle = $("html > head > title, title").first().text().trim();
  return docTitle;
}

const VISUALLY_HIDDEN_CLASS_RE =
  /\b(sr-only|visually-hidden|visuallyhidden|screen-reader-only|screenreader-only|u-sr-only|a11y-hidden|clip)\b/i;

export interface H1ElementInfo {
  text: string;
  classes: string;
  isVisuallyHidden: boolean;
  outerHtml: string;
}

export function isVisuallyHiddenElement($: cheerio.CheerioAPI, el: unknown): boolean {
  const node = $(el as never);
  const classes = node.attr("class") || "";
  const style = node.attr("style") || "";
  const hiddenAttr = node.attr("hidden") !== undefined;
  const ariaHidden = node.attr("aria-hidden") === "true";

  return (
    ariaHidden ||
    hiddenAttr ||
    VISUALLY_HIDDEN_CLASS_RE.test(classes) ||
    /display\s*:\s*none/i.test(style) ||
    /visibility\s*:\s*hidden/i.test(style) ||
    /clip(?:-path)?\s*:/i.test(style) ||
    (/position\s*:\s*absolute/i.test(style) && /left\s*:\s*-?\d{3,}px/i.test(style))
  );
}

export function getH1Elements($: cheerio.CheerioAPI): H1ElementInfo[] {
  return $("h1")
    .map((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const classes = $(el).attr("class") || "";
      let outerHtml = $.html(el) || "";
      if (outerHtml.length > 400) {
        outerHtml = `${outerHtml.slice(0, 400)}…`;
      }
      return {
        text,
        classes,
        isVisuallyHidden: isVisuallyHiddenElement($, el),
        outerHtml,
      };
    })
    .get()
    .filter((h) => Boolean(h.text));
}

export function getH1s($: cheerio.CheerioAPI): string[] {
  return getH1Elements($).map((h) => h.text);
}

/** Collect headings in document order (not grouped by level). */
export function getHeadings($: cheerio.CheerioAPI): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag = (((el as { tagName?: string }).tagName) || "").toLowerCase();
    const level = Number.parseInt(tag.replace("h", ""), 10);
    if (!level) return;
    headings.push({ level, text: $(el).text().replace(/\s+/g, " ").trim() });
  });
  return headings;
}

export function getImages($: cheerio.CheerioAPI): {
  src: string;
  alt: string;
  /** True when alt attribute exists (including empty string for decorative images). */
  hasAltAttribute: boolean;
  hasDimensions: boolean;
  loading: string;
}[] {
  return $("img")
    .map((_, el) => {
      const altAttr = $(el).attr("alt");
      return {
        src: $(el).attr("src") || "",
        alt: (altAttr ?? "").trim(),
        hasAltAttribute: altAttr !== undefined,
        hasDimensions: Boolean($(el).attr("width") && $(el).attr("height")),
        loading: $(el).attr("loading") || "",
      };
    })
    .get();
}

export function getInternalLinks($: cheerio.CheerioAPI): string[] {
  return $('a[href]')
    .map((_, el) => $(el).attr("href") || "")
    .get()
    .filter(Boolean);
}

export function getJsonLdSchemas($: cheerio.CheerioAPI): unknown[] {
  const schemas: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).html();
      if (text) schemas.push(JSON.parse(text));
    } catch {
      // invalid JSON-LD
    }
  });
  return schemas;
}

export function getHreflangTags($: cheerio.CheerioAPI): { hreflang: string; href: string }[] {
  return $('link[rel="alternate"][hreflang]')
    .map((_, el) => ({
      hreflang: $(el).attr("hreflang") || "",
      href: $(el).attr("href") || "",
    }))
    .get();
}

export function getWordCount($: cheerio.CheerioAPI): number {
  // Prefer main content — nav/footer chrome inflates SPA shells
  const main = $("main, article, [role='main']").first();
  const source = main.length > 0 ? main : $("body");
  const clone = source.clone();
  clone.find("nav, footer, script, style, noscript, svg, iframe").remove();
  const bodyText = clone.text().replace(/\s+/g, " ").trim();
  return bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
}

export function hasViewportMeta($: cheerio.CheerioAPI): boolean {
  return $('meta[name="viewport"]').length > 0;
}

export function getOpenGraphTags($: cheerio.CheerioAPI): Record<string, string> {
  const tags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr("property");
    const content = $(el).attr("content");
    if (property && content) tags[property] = content;
  });
  return tags;
}

export function getTwitterTags($: cheerio.CheerioAPI): Record<string, string> {
  const tags: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) tags[name] = content;
  });
  return tags;
}

export function hasBreadcrumbs($: cheerio.CheerioAPI): boolean {
  return (
    $('[aria-label*="breadcrumb" i], nav.breadcrumb, .breadcrumb, [itemtype*="BreadcrumbList"]').length > 0
  );
}

export function countScripts($: cheerio.CheerioAPI): { total: number; external: number; inline: number; thirdParty: number } {
  let external = 0;
  let inline = 0;
  let thirdParty = 0;
  $("script").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      external++;
      if (!src.startsWith("/") && !src.startsWith("./")) thirdParty++;
    } else {
      inline++;
    }
  });
  return { total: external + inline, external, inline, thirdParty };
}

export function countStylesheets($: cheerio.CheerioAPI): number {
  return $('link[rel="stylesheet"]').length;
}

export function getResourceHints($: cheerio.CheerioAPI): { preconnect: number; preload: number; dnsPrefetch: number } {
  return {
    preconnect: $('link[rel="preconnect"]').length,
    preload: $('link[rel="preload"]').length,
    dnsPrefetch: $('link[rel="dns-prefetch"]').length,
  };
}

export function hasMainContent($: cheerio.CheerioAPI): boolean {
  const text = $("main, article, [role='main'], h1, p").text().trim();
  return text.length > 100;
}

/**
 * Next.js / framework runtime assets that are NOT SEO findings.
 * Dumping full <head> pollutes solutions with webpack chunks & CSS preloads.
 */
export function isFrameworkAssetMarkup(html: string): boolean {
  const h = html.toLowerCase();
  // Preloads / styles / _next runtime are never the SEO finding itself
  if (/\/_next\//.test(h)) return true;
  if (/webpack-|polyfills-|main-app-|framework-|app-pages-internals/i.test(h)) return true;
  if (/rel=["'](?:preload|modulepreload|prefetch)["']/i.test(h)) return true;
  if (/<script[^>]+src=/i.test(h) && !/application\/ld\+json/i.test(h)) return true;
  if (/<link[^>]+rel=["']stylesheet["']/i.test(h)) return true;
  if (/<style[\s>]/i.test(h)) return true;
  return false;
}

/** Collapse noisy framework/runtime tags out of HTML snippets shown in solutions. */
export function stripFrameworkHeadNoise(html: string): string {
  return html
    .replace(/<link\b[^>]*>/gi, (tag) => (isFrameworkAssetMarkup(tag) ? "" : tag))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => {
      if (/type=["']application\/ld\+json["']/i.test(tag)) return tag;
      return isFrameworkAssetMarkup(tag) ? "" : tag;
    })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * SEO-focused <head> context: title, meta robots/description, canonical, hreflang, viewport, OG.
 * Intentionally excludes Next.js chunks / webpack preloads.
 */
export function extractSeoHeadContext($: cheerio.CheerioAPI, options?: { maxTags?: number }): string {
  const maxTags = options?.maxTags ?? 12;
  const lines: string[] = [];
  const push = (html: string | null | undefined) => {
    if (!html?.trim()) return;
    const cleaned = html.replace(/\s+/g, " ").trim();
    if (!cleaned || isFrameworkAssetMarkup(cleaned)) return;
    if (lines.includes(cleaned)) return;
    lines.push(cleaned);
  };

  push($("head > title").first().toString() || undefined);
  $("head > meta[name], head > meta[property], head > meta[http-equiv]").each((_, el) => {
    const name = ($(el).attr("name") || $(el).attr("property") || $(el).attr("http-equiv") || "").toLowerCase();
    if (
      /^(description|robots|viewport|googlebot|keywords)$/.test(name) ||
      name.startsWith("og:") ||
      name.startsWith("twitter:")
    ) {
      push($.html(el));
    }
  });
  $("head > link[rel]").each((_, el) => {
    const rel = ($(el).attr("rel") || "").toLowerCase();
    if (rel === "canonical" || rel === "alternate" || rel === "manifest") {
      push($.html(el));
    }
  });

  const body = lines.slice(0, maxTags).map((l) => `  ${l}`).join("\n");
  if (!body) {
    return `<head>\n  <!-- No SEO-relevant meta/link tags found (framework assets omitted) -->\n</head>`;
  }
  return `<head>\n${body}\n  <!-- Next.js /_next chunks, webpack preloads & stylesheets omitted -->\n</head>`;
}

/** Self-referencing absolute canonical for this page URL. */
export function buildSelfReferencingCanonicalTag(pageUrl: string): string {
  let href = pageUrl;
  try {
    const u = new URL(pageUrl);
    u.hash = "";
    href = u.toString();
    if (href.endsWith("/") && u.pathname !== "/") {
      // keep trailing slash decisions from the live URL
    }
  } catch {
    /* keep raw */
  }
  return `<link rel="canonical" href="${href}" />`;
}

/** True when a code sample looks like polluted head dump (not a real SEO fix). */
export function isPollutedSeoSnippet(code: string | undefined | null): boolean {
  if (!code?.trim()) return true;
  const h = code.toLowerCase();
  if (h.includes('rel="preload"') || h.includes("rel='preload'")) return true;
  if (h.includes("modulepreload") || h.includes("/_next/")) return true;
  if (h.includes("<style") || h.includes("webpack-")) return true;
  if ((h.match(/<link\b/g) || []).length >= 3 && !h.includes('rel="canonical"') && !h.includes("rel='canonical'")) {
    return true;
  }
  return false;
}

/**
 * Always produce page-accurate canonical snippets from the live page URL.
 * Does not depend on scraped head HTML (avoids preload/chunk pollution).
 */
export function buildPageCanonicalSolution(pageUrl: string): { issueCode: string; solutionCode: string } {
  let path = "/";
  let href = pageUrl;
  try {
    const u = new URL(pageUrl);
    path = u.pathname || "/";
    u.hash = "";
    href = u.toString();
  } catch {
    /* keep raw */
  }

  return {
    issueCode: `<!-- What search engines see on ${path} -->
<head>
  <!-- PROBLEM: no self-referencing canonical for this URL -->
</head>`,
    solutionCode: `+ <link rel="canonical" href="${href}" />

// This page path: ${path}
// Use the absolute URL of THIS page (self-referencing).
// Optional (Next.js App Router):
// export const metadata = { alternates: { canonical: '${href}' } };`,
  };
}

export function buildCanonicalIssueCodes(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  mode: "missing" | "relative" | "wrong" | "ok",
  existingCanonical?: string
): { issueCode: string; solutionCode: string; evidence: string[] } {
  const path = (() => {
    try {
      return new URL(pageUrl).pathname || "/";
    } catch {
      return pageUrl;
    }
  })();
  const pure = buildPageCanonicalSolution(pageUrl);
  const selfTag = buildSelfReferencingCanonicalTag(pageUrl);

  if (mode === "missing") {
    return {
      evidence: [`No <link rel="canonical"> on ${path}`],
      issueCode: pure.issueCode,
      solutionCode: pure.solutionCode,
    };
  }

  const found =
    extractRealElementSnippet($, 'link[rel="canonical"]') ||
    extractRealElementSnippet($, "link[rel='canonical']") ||
    `<link rel="canonical" href="${existingCanonical || ""}" />`;

  if (mode === "relative") {
    return {
      evidence: [existingCanonical || found],
      issueCode: `<!-- Found relative canonical on ${path} -->\n- ${found}`,
      solutionCode: pure.solutionCode,
    };
  }

  if (mode === "wrong") {
    return {
      evidence: [existingCanonical || found, `Expected self-ref: ${pageUrl}`],
      issueCode: `<!-- Canonical does not match this page (${path}) -->\n- ${found}`,
      solutionCode: pure.solutionCode,
    };
  }

  return {
    evidence: [existingCanonical || pageUrl],
    issueCode: found,
    solutionCode: selfTag,
  };
}

export function extractRealElementSnippet($: cheerio.CheerioAPI, selector: string): string | null {
  try {
    const el = $(selector).first();
    if (!el || el.length === 0) return null;

    // Prefer compact SEO head context instead of dumping entire polluted <head>
    if (selector.toLowerCase() === "head") {
      return extractSeoHeadContext($);
    }

    // Collect up to 3 parent ancestor elements for full Chrome DevTools context
    const ancestors: { tag: string; attrStr: string }[] = [];
    let current = el.parent();
    let depth = 0;

    while (current && current.length > 0 && depth < 3) {
      const g = current.get(0);
      if (!g) break;
      const tag = (g.tagName || "div").toLowerCase();
      if (tag === "html" || tag === "body") break;

      const attrs: string[] = [];
      const cls = current.attr("class");
      const id = current.attr("id");
      if (id) attrs.push(`id="${id}"`);
      if (cls) attrs.push(`class="${cls}"`);

      for (const [k, v] of Object.entries(g.attribs || {})) {
        if (k !== "class" && k !== "id" && (k.startsWith("data-") || k === "role" || k === "aria-label")) {
          attrs.push(`${k}="${v}"`);
        }
      }

      const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
      ancestors.unshift({ tag, attrStr });
      current = current.parent();
      depth++;
    }

    // Clean up target outer HTML snippet
    let targetHtml = $.html(el);
    targetHtml = stripFrameworkHeadNoise(targetHtml)
      .replace(/srcset="[^"]+"/g, 'srcset="..."')
      .replace(/data:image\/[^;]+;base64,[^"']+/g, "data:image/...")
      // Drop huge minified CSS/JS blobs from SEO snippets
      .replace(/<style(\s[^>]*)?>[\s\S]*?<\/style>/gi, (_m, attrs = "") => {
        const inner = _m.replace(/^<style[^>]*>/i, "").replace(/<\/style>$/i, "");
        if (inner.length <= 240) return _m;
        return `<style${attrs || ""}>/* … ${inner.length} chars CSS omitted … */</style>`;
      })
      .replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, (m, attrs = "") => {
        if (/type=["']application\/ld\+json["']/i.test(attrs || "")) return m;
        if (/\bsrc=/i.test(attrs || "")) {
          return isFrameworkAssetMarkup(m) ? "" : m;
        }
        const inner = m.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
        if (!inner.trim() || inner.length <= 160) return m;
        return `<script${attrs || ""}>/* … JS omitted … */</script>`;
      });

    if (!targetHtml.trim()) return null;

    // Cap large trees (main/article dumps) so solutions stay readable
    const MAX_SNIPPET = 1200;
    if (targetHtml.length > MAX_SNIPPET) {
      targetHtml = `${targetHtml.slice(0, MAX_SNIPPET)}\n  <!-- … ${targetHtml.length - MAX_SNIPPET} chars omitted … -->`;
    }

    // Build indented DOM tree matching Chrome DevTools inspector
    let indent = "";
    let openingTags = "";
    let closingTags = "";

    for (const a of ancestors) {
      openingTags += `${indent}<${a.tag}${a.attrStr}>\n`;
      indent += "  ";
    }

    const targetLines = targetHtml.split("\n").map((l) => `${indent}${l}`).join("\n");

    for (let i = ancestors.length - 1; i >= 0; i--) {
      indent = "  ".repeat(i);
      closingTags += `\n${indent}</${ancestors[i].tag}>`;
    }

    const full = `${openingTags}${targetLines}${closingTags}`;
    return full.length > MAX_SNIPPET + 200 ? `${full.slice(0, MAX_SNIPPET + 200)}\n<!-- … truncated … -->` : full;
  } catch {
    return null;
  }
}
