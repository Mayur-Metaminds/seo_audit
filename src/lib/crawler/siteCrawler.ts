import type { AuditConfig, CrawledPage } from "@/types/audit.types";
import { fetchWithRedirects } from "./fetchPage";
import { fetchRobotsTxt, fetchSitemap, isUrlBlockedByRobots } from "./sitemap";
import { isIndexableUrl, isSameDomain, normalizeUrl } from "@/lib/utils/url";
import { parseHtml, getInternalLinks } from "@/lib/utils/html";

export interface CrawlResult {
  pages: CrawledPage[];
  allDiscoveredUrls: string[];
  /** Discovered URLs that were not fetched (left in queue / hit maxPages). */
  remainingUrls: string[];
  /** URLs skipped because robots.txt blocked them. */
  blockedUrls: string[];
  /** True when crawl queue was limited to sitemap.xml (+ nested) URLs only. */
  sitemapOnly: boolean;
  robots: Awaited<ReturnType<typeof fetchRobotsTxt>>;
  sitemap: Awaited<ReturnType<typeof fetchSitemap>>;
  linkStatusMap: Map<string, number>;
}

export type CrawlProgressCallback = (
  current: number,
  discovered: number,
  remaining: number,
  url: string
) => void;

const CRAWL_CONCURRENCY = 5;

/**
 * Crawl policy (strict, sitemap-driven only):
 * - Page universe = leaf URLs discovered by digging robots Sitemap: + /sitemap.xml
 *   and any nested sitemap / .xml files those documents reference (any name).
 * - Never invent routes from on-page links or guessed sitemap paths.
 * - Seed URL is included so the requested audit entry is always checked.
 * - If no sitemap pages found: crawl only the seed URL.
 */
export async function crawlSite(
  startUrl: string,
  config: AuditConfig,
  onProgress?: CrawlProgressCallback
): Promise<CrawlResult> {
  const baseUrl = normalizeUrl(startUrl);
  const origin = new URL(baseUrl).origin;

  const robots = await fetchRobotsTxt(baseUrl);
  const sitemap = await fetchSitemap(baseUrl, robots.sitemaps);

  const queueSet = new Set<string>();
  const crawled = new Map<string, CrawledPage>();
  const allDiscovered = new Set<string>();
  const blockedUrls = new Set<string>();
  const linkStatusMap = new Map<string, number>();

  const sitemapOnly = sitemap.exists && sitemap.urls.length > 0;

  if (sitemapOnly) {
    // Strict sitemap universe
    for (const sitemapUrl of sitemap.urls) {
      try {
        if (!isSameDomain(sitemapUrl, baseUrl, config.includeSubdomains)) continue;
        if (!isIndexableUrl(sitemapUrl)) continue;
        const normalized = normalizeUrl(sitemapUrl);
        queueSet.add(normalized);
        allDiscovered.add(normalized);
      } catch {
        /* ignore bad loc */
      }
    }

    // Always include the URL the user asked to audit
    try {
      if (isSameDomain(baseUrl, origin, config.includeSubdomains)) {
        const seed = normalizeUrl(baseUrl);
        queueSet.add(seed);
        allDiscovered.add(seed);
      }
    } catch {
      /* ignore */
    }
  } else {
    // No sitemap → single-page seed only (never invent off-link URLs)
    queueSet.add(baseUrl);
    allDiscovered.add(baseUrl);
  }

  const queue = [...queueSet];
  const limit = config.maxPages === Infinity ? Number.MAX_SAFE_INTEGER : config.maxPages;

  while (crawled.size < limit && queue.length > 0) {
    const batch: string[] = [];
    while (batch.length < CRAWL_CONCURRENCY && queue.length > 0 && crawled.size + batch.length < limit) {
      const url = queue.shift()!;
      if (crawled.has(url) || batch.includes(url) || blockedUrls.has(url)) continue;
      if (isUrlBlockedByRobots(url, robots.disallows, robots.allows)) {
        blockedUrls.add(url);
        continue;
      }
      batch.push(url);
    }

    if (batch.length === 0) {
      if (queue.length > 0) {
        for (const url of queue) {
          if (!crawled.has(url)) blockedUrls.add(url);
        }
        queue.length = 0;
      }
      break;
    }

    await Promise.all(
      batch.map(async (url) => {
        try {
          const page = await fetchWithRedirects(url);
          // Preserve HTTP body as rawHtml for view-source parity (head SEO / JSON-LD)
          crawled.set(url, { ...page, rawHtml: page.html });
          linkStatusMap.set(normalizeUrl(page.finalUrl), page.statusCode);
          linkStatusMap.set(url, page.statusCode);

          // IMPORTANT: do NOT expand crawl queue from in-page links.
          // Link graph is used only for broken-link / orphan analysis against sitemap pages.
        } catch (error) {
          crawled.set(url, {
            url,
            finalUrl: url,
            statusCode: 0,
            html: "",
            rawHtml: "",
            headers: {},
            responseTimeMs: 0,
            ttfbMs: 0,
            contentLength: 0,
            redirectChain: [],
            redirectStatuses: [],
            contentType: "",
            error: error instanceof Error ? error.message : "Fetch failed",
          });
          linkStatusMap.set(url, 0);
        }

        const remaining = Math.max(0, allDiscovered.size - crawled.size - blockedUrls.size);
        onProgress?.(crawled.size, allDiscovered.size, remaining, url);
      })
    );
  }

  const remainingUrls = [...allDiscovered].filter((u) => !crawled.has(u) && !blockedUrls.has(u));

  return {
    pages: [...crawled.values()],
    allDiscoveredUrls: [...allDiscovered],
    remainingUrls,
    blockedUrls: [...blockedUrls],
    sitemapOnly,
    robots,
    sitemap,
    linkStatusMap,
  };
}

/**
 * Crawl policy for Webflow & General Websites (Deep Link Crawler):
 * - Discovers pages starting from startUrl and by traversing internal HTML <a href="..."> links.
 * - Also checks robots.txt and sitemap.xml to add sitemap URLs as initial discovery points if available.
 * - Extracts links from fetched pages, normalizes them, filters non-indexable extensions, checks robots.txt, and queues new internal links up to maxPages.
 * - Solves missing/incomplete sitemap issues for Webflow, WordPress, Shopify, Wix, and general websites.
 */
export async function crawlWebflowSite(
  startUrl: string,
  config: AuditConfig,
  onProgress?: CrawlProgressCallback
): Promise<CrawlResult> {
  const baseUrl = normalizeUrl(startUrl);

  const robots = await fetchRobotsTxt(baseUrl);
  const sitemap = await fetchSitemap(baseUrl, robots.sitemaps);

  const queueSet = new Set<string>();
  const crawled = new Map<string, CrawledPage>();
  const allDiscovered = new Set<string>();
  const blockedUrls = new Set<string>();
  const linkStatusMap = new Map<string, number>();

  // Seed with user's target URL
  queueSet.add(baseUrl);
  allDiscovered.add(baseUrl);

  // If sitemap exists, add its URLs as initial discovery seeds too
  if (sitemap.exists && sitemap.urls.length > 0) {
    for (const sitemapUrl of sitemap.urls) {
      try {
        if (!isSameDomain(sitemapUrl, baseUrl, config.includeSubdomains)) continue;
        if (!isIndexableUrl(sitemapUrl)) continue;
        const normalized = normalizeUrl(sitemapUrl);
        queueSet.add(normalized);
        allDiscovered.add(normalized);
      } catch {
        /* ignore bad loc */
      }
    }
  }

  const queue = [...queueSet];
  const limit = config.maxPages === Infinity ? Number.MAX_SAFE_INTEGER : config.maxPages;

  while (crawled.size < limit && queue.length > 0) {
    const batch: string[] = [];
    while (batch.length < CRAWL_CONCURRENCY && queue.length > 0 && crawled.size + batch.length < limit) {
      const url = queue.shift()!;
      if (crawled.has(url) || batch.includes(url) || blockedUrls.has(url)) continue;
      if (isUrlBlockedByRobots(url, robots.disallows, robots.allows)) {
        blockedUrls.add(url);
        continue;
      }
      batch.push(url);
    }

    if (batch.length === 0) {
      if (queue.length > 0) {
        for (const url of queue) {
          if (!crawled.has(url)) blockedUrls.add(url);
        }
        queue.length = 0;
      }
      break;
    }

    await Promise.all(
      batch.map(async (url) => {
        try {
          const page = await fetchWithRedirects(url);
          crawled.set(url, { ...page, rawHtml: page.html });
          linkStatusMap.set(normalizeUrl(page.finalUrl), page.statusCode);
          linkStatusMap.set(url, page.statusCode);

          // Deep Link Discovery for Webflow & General Web Audit:
          // 1. Ensure page.finalUrl belongs strictly to the audited site domain (did NOT redirect to external domain)
          const isFinalUrlSameDomain = isSameDomain(page.finalUrl, baseUrl, config.includeSubdomains);

          if (isFinalUrlSameDomain && page.statusCode >= 200 && page.statusCode < 400 && page.html) {
            const $ = parseHtml(page.html);
            const extractedHrefs = getInternalLinks($);

            for (const rawHref of extractedHrefs) {
              if (
                !rawHref ||
                rawHref.startsWith("#") ||
                rawHref.startsWith("javascript:") ||
                rawHref.startsWith("mailto:") ||
                rawHref.startsWith("tel:") ||
                rawHref.startsWith("whatsapp:") ||
                rawHref.startsWith("sms:") ||
                rawHref.startsWith("data:") ||
                rawHref.startsWith("blob:")
              ) {
                continue;
              }

              try {
                const resolved = new URL(rawHref, page.finalUrl);
                resolved.hash = "";
                const absoluteUrl = resolved.href;

                // STRICT DOMAIN GUARD: Must belong strictly to the audited website domain!
                if (!isSameDomain(absoluteUrl, baseUrl, config.includeSubdomains)) continue;
                if (!isIndexableUrl(absoluteUrl)) continue;

                const normalized = normalizeUrl(absoluteUrl);

                if (!allDiscovered.has(normalized)) {
                  allDiscovered.add(normalized);
                  if (isUrlBlockedByRobots(normalized, robots.disallows, robots.allows)) {
                    blockedUrls.add(normalized);
                  } else if (!crawled.has(normalized) && !queue.includes(normalized)) {
                    queue.push(normalized);
                  }
                }
              } catch {
                /* ignore invalid URL */
              }
            }
          }
        } catch (error) {
          crawled.set(url, {
            url,
            finalUrl: url,
            statusCode: 0,
            html: "",
            rawHtml: "",
            headers: {},
            responseTimeMs: 0,
            ttfbMs: 0,
            contentLength: 0,
            redirectChain: [],
            redirectStatuses: [],
            contentType: "",
            error: error instanceof Error ? error.message : "Fetch failed",
          });
          linkStatusMap.set(url, 0);
        }

        const remaining = Math.max(0, allDiscovered.size - crawled.size - blockedUrls.size);
        onProgress?.(crawled.size, allDiscovered.size, remaining, url);
      })
    );
  }

  const remainingUrls = [...allDiscovered].filter((u) => !crawled.has(u) && !blockedUrls.has(u));

  return {
    pages: [...crawled.values()],
    allDiscoveredUrls: [...allDiscovered],
    remainingUrls,
    blockedUrls: [...blockedUrls],
    sitemapOnly: false,
    robots,
    sitemap,
    linkStatusMap,
  };
}

const SENSITIVE_SIGNATURES: Record<string, RegExp[]> = {
  "/.env": [/^[A-Z_]+=.+$/m, /DB_PASSWORD/i, /SECRET/i],
  "/.git/config": [/\[core\]/, /\[remote/],
  "/wp-config.php": [/DB_NAME/i, /DB_PASSWORD/i],
  "/phpinfo.php": [/phpinfo\(\)/i, /PHP Version/i],
};

export async function checkSensitiveFiles(
  origin: string
): Promise<{ path: string; exposed: boolean; statusCode: number }[]> {
  const sensitivePaths = ["/.env", "/.git/config", "/wp-config.php", "/phpinfo.php", "/.env.local"];
  const results = [];

  for (const path of sensitivePaths) {
    try {
      const page = await fetchWithRedirects(`${origin}${path}`);
      const body = page.html || "";
      const signatures = SENSITIVE_SIGNATURES[path] || [];
      const looksSensitive =
        page.statusCode === 200 &&
        body.length > 0 &&
        !page.contentType.includes("text/html") &&
        signatures.some((rx) => rx.test(body));

      results.push({
        path,
        exposed: looksSensitive,
        statusCode: page.statusCode,
      });
    } catch {
      results.push({ path, exposed: false, statusCode: 0 });
    }
  }

  return results;
}

export async function check404Page(
  origin: string
): Promise<{ hasCustom404: boolean; returns404: boolean; url: string }> {
  const testUrl = `${origin}/this-page-definitely-does-not-exist-${Date.now()}`;
  try {
    const page = await fetchWithRedirects(testUrl);
    const returns404 = page.statusCode === 404;
    const hasCustom404 = returns404 && page.html.length > 200 && page.html.includes("<");
    return { hasCustom404, returns404, url: testUrl };
  } catch {
    return { hasCustom404: false, returns404: false, url: testUrl };
  }
}

export function findHomepage(pages: CrawledPage[], baseUrl: string): CrawledPage | undefined {
  return pages.find((p) => normalizeUrl(p.finalUrl) === normalizeUrl(baseUrl));
}
