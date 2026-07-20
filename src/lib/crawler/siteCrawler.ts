import type { AuditConfig, CrawledPage } from "@/types/audit.types";
import { fetchWithRedirects } from "./fetchPage";
import { fetchRobotsTxt, fetchSitemap, isUrlBlockedByRobots } from "./sitemap";
import { isIndexableUrl, isSameDomain, normalizeUrl, resolveUrl } from "@/lib/utils/url";
import { parseHtml } from "@/lib/utils/html";

export interface CrawlResult {
  pages: CrawledPage[];
  allDiscoveredUrls: string[];
  robots: Awaited<ReturnType<typeof fetchRobotsTxt>>;
  sitemap: Awaited<ReturnType<typeof fetchSitemap>>;
  linkStatusMap: Map<string, number>;
}

const CRAWL_CONCURRENCY = 3;

export async function crawlSite(
  startUrl: string,
  config: AuditConfig,
  onProgress?: (current: number, total: number, url: string) => void
): Promise<CrawlResult> {
  const baseUrl = normalizeUrl(startUrl);

  const robots = await fetchRobotsTxt(baseUrl);
  const sitemap = await fetchSitemap(baseUrl, robots.sitemaps);

  const queueSet = new Set<string>([baseUrl]);
  const crawled = new Map<string, CrawledPage>();
  const allDiscovered = new Set<string>([baseUrl]);
  const linkStatusMap = new Map<string, number>();

  for (const sitemapUrl of sitemap.urls) {
    if (isSameDomain(sitemapUrl, baseUrl) && isIndexableUrl(sitemapUrl)) {
      const normalized = normalizeUrl(sitemapUrl);
      queueSet.add(normalized);
      allDiscovered.add(normalized);
    }
  }

  const queue = [...queueSet];

  const limit = config.maxPages === Infinity ? Number.MAX_SAFE_INTEGER : config.maxPages;

  while (crawled.size < limit && queue.length > 0) {
    const batch: string[] = [];
    while (batch.length < CRAWL_CONCURRENCY && queue.length > 0 && crawled.size + batch.length < limit) {
      const url = queue.shift()!;
      if (crawled.has(url) || batch.includes(url)) continue;
      if (isUrlBlockedByRobots(url, robots.disallows, robots.allows)) continue;
      batch.push(url);
    }

    if (batch.length === 0) break;

    await Promise.all(
      batch.map(async (url) => {
        onProgress?.(crawled.size + 1, queueSet.size, url);

        try {
          const page = await fetchWithRedirects(url);
          crawled.set(url, page);
          linkStatusMap.set(normalizeUrl(page.finalUrl), page.statusCode);

          if (page.statusCode === 200 && page.html) {
            const $ = parseHtml(page.html);
            $("a[href]").each((_, el) => {
              const href = $(el).attr("href");
              if (!href) return;
              const resolved = resolveUrl(href, page.finalUrl);
              if (!resolved || !isIndexableUrl(resolved)) return;
              if (!isSameDomain(resolved, baseUrl)) return;

              const normalized = normalizeUrl(resolved);
              allDiscovered.add(normalized);

              if (!crawled.has(normalized) && !queueSet.has(normalized)) {
                queueSet.add(normalized);
                queue.push(normalized);
              }
            });
          }
        } catch (error) {
          crawled.set(url, {
            url,
            finalUrl: url,
            statusCode: 0,
            html: "",
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
      })
    );
  }

  return {
    pages: [...crawled.values()],
    allDiscoveredUrls: [...allDiscovered],
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
