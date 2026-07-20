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

export function getH1s($: cheerio.CheerioAPI): string[] {
  return $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

export function getHeadings($: cheerio.CheerioAPI): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  for (let i = 1; i <= 6; i++) {
    $(`h${i}`).each((_, el) => {
      headings.push({ level: i, text: $(el).text().trim() });
    });
  }
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

export function getFirst100Words($: cheerio.CheerioAPI): string {
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.split(" ").slice(0, 100).join(" ");
}
