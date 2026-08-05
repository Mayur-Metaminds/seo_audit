import type { RobotsTxtInfo, SitemapInfo } from "@/types/audit.types";
import {
  fetchTextResource,
  isValidRobotsBody,
  isValidSitemapBody,
} from "./fetchPage";

/**
 * Sitemap discovery policy (strict):
 * 1. Entry points only:
 *    - Sitemap: URLs declared in robots.txt (whatever they are — we do not invent names)
 *    - {origin}/sitemap.xml (standard root)
 * 2. Open each entry and dig: if a <loc> points at another sitemap / .xml file, fetch and
 *    expand it recursively. Child names can be anything (main.xml, posts.xml, …) —
 *    we never guess those paths; we only follow locs found inside parent sitemaps.
 * 3. Crawl/queue pages = only leaf HTML page <loc> values after full expansion.
 *    Never invent pages from on-page links or guessed routes.
 */
const MAX_SITEMAP_DEPTH = 8;
const MAX_CHILD_SITEMAPS = 250;

interface RobotsGroup {
  userAgents: string[];
  disallows: string[];
  allows: string[];
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

/** Extract all <loc> values, including CDATA. */
function extractLocs(body: string): string[] {
  const results: string[] = [];
  const re = /<loc\b[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const loc = decodeXmlEntities(m[1] || "");
    if (loc) results.push(loc);
  }
  return results;
}

/**
 * True when a <loc> should be opened as another sitemap document, not treated as a page.
 * Only follow what the parent actually listed — no guessing unknown filenames.
 */
function isNestedSitemapLoc(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    // Nested maps referenced as .xml (any name: main.xml, posts.xml, …)
    return path.endsWith(".xml") || path.endsWith(".xml.gz");
  } catch {
    return false;
  }
}

function normalizeSitemapUrl(url: string, base?: string): string | null {
  try {
    return (base ? new URL(url, base) : new URL(url)).toString();
  } catch {
    return null;
  }
}

function parseRobotsGroups(content: string): { groups: RobotsGroup[]; sitemaps: string[]; hasSyntaxIssues: boolean } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let hasSyntaxIssues = false;
  let current: RobotsGroup = { userAgents: [], disallows: [], allows: [] };

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      hasSyntaxIssues = true;
      continue;
    }

    const directive = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (directive === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (directive === "user-agent") {
      if (current.userAgents.length > 0 || current.disallows.length > 0 || current.allows.length > 0) {
        groups.push(current);
      }
      current = { userAgents: [value.toLowerCase()], disallows: [], allows: [] };
    } else if (directive === "disallow") {
      current.disallows.push(value);
    } else if (directive === "allow") {
      current.allows.push(value);
    }
  }

  if (current.userAgents.length > 0 || current.disallows.length > 0 || current.allows.length > 0) {
    groups.push(current);
  }

  return { groups, sitemaps, hasSyntaxIssues };
}

function getApplicableGroup(groups: RobotsGroup[]): RobotsGroup | null {
  const botName = "metamindsseoaudit";
  const star = groups.find((g) => g.userAgents.includes("*"));
  const specific = groups.find((g) =>
    g.userAgents.some((ua) => botName.includes(ua.replace(/[^a-z0-9]/g, "")) || ua.includes("metaminds"))
  );
  return specific || star || groups[0] || null;
}

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsTxtInfo> {
  const origin = new URL(baseUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;

  try {
    const page = await fetchTextResource(robotsUrl);
    const content = page.html || "";
    const exists =
      page.statusCode === 200 && content.length > 0 && isValidRobotsBody(content, page.contentType || "");

    if (!exists) {
      return { exists: false, content: "", sitemaps: [], disallows: [], allows: [], hasSyntaxIssues: false };
    }

    const { groups, sitemaps, hasSyntaxIssues } = parseRobotsGroups(content);
    const group = getApplicableGroup(groups);

    return {
      exists,
      content,
      sitemaps,
      disallows: group?.disallows || [],
      allows: group?.allows || [],
      hasSyntaxIssues,
    };
  } catch {
    return { exists: false, content: "", sitemaps: [], disallows: [], allows: [], hasSyntaxIssues: true };
  }
}

async function fetchSingleSitemap(
  url: string,
  visited = new Set<string>(),
  depth = 0
): Promise<SitemapInfo & { childSitemaps: string[] }> {
  const empty = (errors: string[]): SitemapInfo & { childSitemaps: string[] } => ({
    exists: false,
    url,
    urls: [],
    urlCount: 0,
    hasLastmod: false,
    errors,
    childSitemaps: [],
  });

  if (depth > MAX_SITEMAP_DEPTH) {
    return empty([`Sitemap nesting deeper than ${MAX_SITEMAP_DEPTH} at ${url}`]);
  }

  let resolvedUrl = url;
  try {
    resolvedUrl = new URL(url).toString();
  } catch {
    return empty([`Invalid sitemap URL: ${url}`]);
  }

  if (visited.has(resolvedUrl)) {
    return empty([]);
  }
  visited.add(resolvedUrl);

  // Do not page-crawl compressed sitemap binary as HTML
  if (resolvedUrl.toLowerCase().includes(".xml.gz")) {
    return empty([`Skipping compressed sitemap (unsupported): ${resolvedUrl}`]);
  }

  try {
    const page = await fetchTextResource(resolvedUrl);
    const body = page.html || "";

    if (page.statusCode !== 200 || !isValidSitemapBody(body, page.contentType || "")) {
      return empty([`Invalid or missing sitemap at ${resolvedUrl} (HTTP ${page.statusCode})`]);
    }

    const pageUrls: string[] = [];
    const errors: string[] = [];
    const childSitemaps: string[] = [];
    const hasLastmod = /<lastmod\b/i.test(body);
    const isIndex = /<sitemapindex\b/i.test(body);
    const locs = extractLocs(body);

    if (isIndex) {
      // sitemapindex: every <loc> is another sitemap — dig into each (name can be anything)
      let childCount = 0;
      for (const loc of locs) {
        if (childCount >= MAX_CHILD_SITEMAPS) {
          errors.push(`Capped nested sitemaps at ${MAX_CHILD_SITEMAPS}`);
          break;
        }
        const childUrl = normalizeSitemapUrl(loc, resolvedUrl);
        if (!childUrl || visited.has(childUrl)) continue;
        childCount += 1;
        childSitemaps.push(childUrl);
        const child = await fetchSingleSitemap(childUrl, visited, depth + 1);
        pageUrls.push(...child.urls);
        errors.push(...child.errors);
        childSitemaps.push(...child.childSitemaps);
      }
    } else {
      // urlset: dig any <loc> that is another .xml map; everything else is a page URL
      for (const loc of locs) {
        const childUrl = normalizeSitemapUrl(loc, resolvedUrl);
        if (!childUrl) continue;

        if (isNestedSitemapLoc(childUrl) && depth < MAX_SITEMAP_DEPTH) {
          if (visited.has(childUrl)) continue;
          childSitemaps.push(childUrl);
          const child = await fetchSingleSitemap(childUrl, visited, depth + 1);
          if (child.exists) {
            pageUrls.push(...child.urls);
            errors.push(...child.errors);
            childSitemaps.push(...child.childSitemaps);
            continue;
          }
          // Nested .xml that is not a valid sitemap — never treat as an HTML page
          if (child.errors.length) errors.push(...child.errors);
          continue;
        }
        pageUrls.push(childUrl);
      }
    }

    const unique = [...new Set(pageUrls.filter(Boolean))];
    return {
      exists: true,
      url: resolvedUrl,
      urls: unique,
      urlCount: unique.length,
      hasLastmod,
      errors,
      childSitemaps: [...new Set(childSitemaps)],
    };
  } catch (error) {
    return empty([error instanceof Error ? error.message : "Failed to fetch sitemap"]);
  }
}

/**
 * Resolve the full set of page URLs by starting only at known entry points and
 * digging into every nested sitemap / .xml declared inside them.
 */
export async function fetchSitemap(baseUrl: string, sitemapUrls?: string[]): Promise<SitemapInfo> {
  const origin = new URL(baseUrl).origin;

  // Entry points: robots Sitemap: lines + always standard /sitemap.xml — nothing guessed
  const entryPoints: string[] = [];
  for (const raw of sitemapUrls || []) {
    try {
      entryPoints.push(new URL(raw, origin).toString());
    } catch {
      /* ignore bad absolute/relative */
    }
  }
  entryPoints.push(`${origin}/sitemap.xml`);

  const uniqueEntries = [...new Set(entryPoints)];
  const visited = new Set<string>();
  const allPageUrls: string[] = [];
  const allErrors: string[] = [];
  let primaryUrl = "";
  let found = false;
  let hasLastmod = false;

  for (const entry of uniqueEntries) {
    if (visited.has(entry)) continue;
    const result = await fetchSingleSitemap(entry, visited, 0);
    if (result.exists) {
      found = true;
      if (!primaryUrl) primaryUrl = result.url;
      allPageUrls.push(...result.urls);
      hasLastmod = hasLastmod || result.hasLastmod;
      if (result.errors.length) allErrors.push(...result.errors);
    } else if (result.errors.length) {
      // Only surface errors for the canonical /sitemap.xml when robots had no pointer
      if (entry === `${origin}/sitemap.xml` || (sitemapUrls && sitemapUrls.length > 0)) {
        allErrors.push(...result.errors);
      }
    }
  }

  const unique = [...new Set(allPageUrls)];
  return {
    exists: found,
    url: primaryUrl || `${origin}/sitemap.xml`,
    urls: unique,
    urlCount: unique.length,
    hasLastmod,
    errors: unique.length > 0
      ? allErrors
      : allErrors.length
        ? allErrors
        : [
            "No sitemap found. Expected robots.txt Sitemap: URL and/or {origin}/sitemap.xml, expanding nested .xml children only from those files.",
          ],
  };
}

export function isUrlBlockedByRobots(url: string, disallows: string[], allows: string[]): boolean {
  const path = new URL(url).pathname;

  for (const allow of allows) {
    if (allow === "/") return false;
    if (allow && path.startsWith(allow)) return false;
  }

  for (const disallow of disallows) {
    if (disallow === "/") return true;
    if (disallow && path.startsWith(disallow)) return true;
  }

  return false;
}
