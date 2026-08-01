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
  return $('link[rel="canonical"]').attr("href")?.trim() || "";
}

export function getTitle($: cheerio.CheerioAPI): string {
  return $("title").first().text().trim();
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

export function getImages($: cheerio.CheerioAPI): { src: string; alt: string; hasDimensions: boolean; loading: string }[] {
  return $("img")
    .map((_, el) => ({
      src: $(el).attr("src") || "",
      alt: ($(el).attr("alt") ?? "").trim(),
      hasDimensions: Boolean($(el).attr("width") && $(el).attr("height")),
      loading: $(el).attr("loading") || "",
    }))
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
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  return bodyText ? bodyText.split(" ").length : 0;
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

export function extractRealElementSnippet($: cheerio.CheerioAPI, selector: string): string | null {
  try {
    const el = $(selector).first();
    if (!el || el.length === 0) return null;

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
    targetHtml = targetHtml
      .replace(/srcset="[^"]+"/g, 'srcset="..."')
      .replace(/data:image\/[^;]+;base64,[^"']+/g, "data:image/...")
      // Drop huge minified CSS/JS blobs from SEO snippets
      .replace(/<style(\s[^>]*)?>[\s\S]*?<\/style>/gi, (_m, attrs = "") => {
        const inner = _m.replace(/^<style[^>]*>/i, "").replace(/<\/style>$/i, "");
        if (inner.length <= 240) return _m;
        return `<style${attrs || ""}>/* … ${inner.length} chars CSS omitted … */</style>`;
      })
      .replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, (m, attrs = "") => {
        if (/\bsrc=/i.test(attrs || "")) return m;
        const inner = m.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
        if (!inner.trim() || inner.length <= 160) return m;
        return `<script${attrs || ""}>/* … JS omitted … */</script>`;
      });

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

    return `${openingTags}${targetLines}${closingTags}`;
  } catch {
    return null;
  }
}
