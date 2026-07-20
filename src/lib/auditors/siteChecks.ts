import type { CheckResult } from "@/types/audit.types";
import type { CrawlResult } from "@/lib/crawler/siteCrawler";
import { normalizeUrl, resolveUrl, isSameDomain } from "@/lib/utils/url";
import { parseHtml, getTitle, getMetaContent } from "@/lib/utils/html";
import type { CrawledPage } from "@/types/audit.types";

function makeResult(
  checkpointId: number,
  status: CheckResult["status"],
  score: number,
  maxScore: number,
  message: string,
  options?: Partial<CheckResult>
): CheckResult {
  return {
    checkpointId,
    status,
    score,
    maxScore,
    message,
    scope: options?.scope || "site",
    ...options,
  };
}

export function auditBrokenLinks(crawl: CrawlResult, baseUrl: string): CheckResult {
  const broken: string[] = [];
  const checked = new Set<string>();

  for (const page of crawl.pages) {
    if (!page.html) continue;
    const $ = parseHtml(page.html);
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const resolved = href ? resolveUrl(href, page.finalUrl) : null;
      if (!resolved || !isSameDomain(resolved, baseUrl)) return;
      const normalized = normalizeUrl(resolved);
      if (checked.has(normalized)) return;
      checked.add(normalized);

      const status = crawl.linkStatusMap.get(normalized);
      if (status !== undefined && status >= 400) {
        broken.push(`${normalized} (HTTP ${status}) from ${page.finalUrl}`);
      }
    });
  }

  if (broken.length > 0) {
    return makeResult(6, "fail", 0, 5, `${broken.length} broken internal link(s) found`, {
      evidence: broken.slice(0, 10),
      recommendation: "Fix or redirect all internal links returning 4xx/5xx.",
      affectedUrls: broken.slice(0, 20).map((b) => b.split(" ")[0]),
    });
  }

  return makeResult(6, "pass", 5, 5, "No broken internal links detected in crawled pages");
}

export function auditDuplicateMeta(crawl: CrawlResult): CheckResult {
  const descMap = new Map<string, string[]>();

  for (const page of crawl.pages) {
    if (!page.html) continue;
    const $ = parseHtml(page.html);
    const desc = getMetaContent($, "description");
    if (!desc) continue;
    const existing = descMap.get(desc) || [];
    existing.push(page.finalUrl);
    descMap.set(desc, existing);
  }

  const dups = [...descMap.entries()].filter(([, urls]) => urls.length > 1);
  if (dups.length > 0) {
    return makeResult(17, "warn", 2, 5, `${dups.length} duplicate meta description(s)`, {
      evidence: dups.slice(0, 3).map(([d, u]) => `"${d.slice(0, 60)}..." on ${u.length} pages`),
      recommendation: "Write unique meta descriptions for each page.",
    });
  }

  return makeResult(17, "pass", 5, 5, "No duplicate meta descriptions in crawled pages");
}

export function auditArchitectureExtras(crawl: CrawlResult, baseUrl: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const allHtml = crawl.pages.map((p) => p.html).join(" ");

  const paginated = crawl.allDiscoveredUrls.filter((u) => /[?&]page=|\/page\/\d+/i.test(u));
  if (paginated.length > 3) {
    checks.push(
      makeResult(24, "warn", 3, 5, `${paginated.length} paginated URLs detected — verify canonicals`, {
        evidence: paginated.slice(0, 3),
        recommendation: "Ensure paginated pages have correct canonical tags pointing to series root or self.",
      })
    );
  } else {
    checks.push(makeResult(24, "pass", 5, 5, "No significant pagination issues detected"));
  }

  const hasPwa = allHtml.includes('rel="manifest"') || allHtml.includes("service-worker");
  const hasAmp = crawl.allDiscoveredUrls.some((u) => u.includes("/amp/")) || allHtml.includes("⚡");
  if (hasPwa || hasAmp) {
    checks.push(makeResult(25, "warn", 3, 5, `${hasPwa ? "PWA" : ""}${hasPwa && hasAmp ? " + " : ""}${hasAmp ? "AMP" : ""} detected — verify content parity`, {
      recommendation: "Ensure PWA/AMP content matches canonical pages.",
    }));
  } else {
    checks.push(makeResult(25, "na", 5, 5, "No AMP/PWA detected (N/A)"));
  }

  const hreflangCount = crawl.pages.reduce((sum, p) => {
    if (!p.html) return sum;
    const $ = parseHtml(p.html);
    return sum + $('link[rel="alternate"][hreflang]').length;
  }, 0);
  if (hreflangCount > 0) {
    checks.push(makeResult(26, "pass", 5, 5, `Hreflang tags present (${hreflangCount} total across pages)`));
  } else {
    checks.push(makeResult(26, "na", 5, 5, "Single-language site — international targeting N/A"));
  }

  const homepage = crawl.pages.find((p) => normalizeUrl(p.finalUrl) === normalizeUrl(baseUrl));
  const httpVersion = homepage?.headers[":status"] || homepage?.headers["x-powered-by"];

  const serverHeader = homepage?.headers["server"] || "";
  if (serverHeader.toLowerCase().includes("cloudflare") || serverHeader.toLowerCase().includes("vercel") || serverHeader.toLowerCase().includes("nginx")) {
    checks.push(makeResult(43, "pass", 5, 5, `CDN/server detected: ${serverHeader.split("/")[0]}`));
  } else {
    checks.push(makeResult(43, "warn", 3, 5, "No CDN signature detected in server headers", {
      recommendation: "Serve static assets from a CDN for better global performance.",
    }));
  }
  void httpVersion;

  return checks;
}

export function auditHttpProtocol(homepage?: CrawledPage): CheckResult {
  if (!homepage) {
    return makeResult(42, "na", 5, 5, "Could not determine HTTP protocol");
  }

  const via = homepage.headers["x-vercel-id"] || homepage.headers["cf-ray"] || homepage.headers["alt-svc"];
  if (via || homepage.finalUrl.startsWith("https://")) {
    return makeResult(42, "pass", 5, 5, "HTTPS enabled (HTTP/2+ assumed on modern hosting)", {
      evidence: via ? ["Modern hosting headers present"] : undefined,
    });
  }

  return makeResult(42, "warn", 2, 5, "Could not verify HTTP/2 or HTTP/3 support");
}

export function audit404Ux(notFoundCheck: { hasCustom404: boolean; returns404: boolean }): CheckResult {
  if (!notFoundCheck.returns404) {
    return makeResult(54, "fail", 0, 5, "Non-existent pages do not return HTTP 404", {
      recommendation: "Configure server to return 404 status for missing pages.",
    });
  }
  if (!notFoundCheck.hasCustom404) {
    return makeResult(54, "warn", 3, 5, "404 status correct but page lacks helpful navigation", {
      recommendation: "Add a custom 404 page with site navigation and search.",
    });
  }
  return makeResult(54, "pass", 5, 5, "Custom 404 page with proper HTTP status");
}

export function auditManualIntegrations(): CheckResult[] {
  return [
    makeResult(48, "manual", 5, 5, "Google Search Console — verify manually", {
      recommendation: "Connect GSC and confirm zero coverage errors.",
    }),
    makeResult(49, "manual", 5, 5, "Bing Webmaster Tools — verify manually", {
      recommendation: "Configure Bing WMT and submit sitemap.",
    }),
  ];
}

export function auditOrphanPages(crawl: CrawlResult, baseUrl: string): CheckResult {
  const inlinkMap = new Map<string, number>();

  for (const page of crawl.pages) {
    if (!page.html) continue;
    const $ = parseHtml(page.html);
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const resolved = href ? resolveUrl(href, page.finalUrl) : null;
      if (!resolved || !isSameDomain(resolved, baseUrl)) return;
      const normalized = normalizeUrl(resolved);
      inlinkMap.set(normalized, (inlinkMap.get(normalized) || 0) + 1);
    });
  }

  const orphans = crawl.allDiscoveredUrls.filter(
    (u) => !inlinkMap.has(normalizeUrl(u)) && normalizeUrl(u) !== normalizeUrl(baseUrl)
  );

  if (orphans.length > crawl.pages.length * 0.3) {
    return makeResult(3, "warn", 2, 5, `${orphans.length} potential orphan/low-link pages`, {
      evidence: orphans.slice(0, 5),
      recommendation: "Add internal links to orphan pages from related content.",
    });
  }

  return makeResult(3, "pass", 5, 5, `Crawl structure healthy (${orphans.length} orphans of ${crawl.allDiscoveredUrls.length} discovered)`);
}

export function auditDuplicateTitles(crawl: CrawlResult): CheckResult {
  const titleMap = new Map<string, string[]>();
  for (const page of crawl.pages) {
    if (!page.html) continue;
    const title = getTitle(parseHtml(page.html));
    if (!title) continue;
    const existing = titleMap.get(title) || [];
    existing.push(page.finalUrl);
    titleMap.set(title, existing);
  }

  const dupTitles = [...titleMap.entries()].filter(([, urls]) => urls.length > 1);
  if (dupTitles.length > 0) {
    return makeResult(17, "fail", 1, 5, `${dupTitles.length} duplicate title tag(s) found`, {
      evidence: dupTitles.slice(0, 3).map(([t, u]) => `"${t}" on ${u.length} pages`),
      recommendation: "Make every page title unique.",
      affectedUrls: dupTitles.flatMap(([, u]) => u),
    });
  }

  return makeResult(17, "pass", 5, 5, "All crawled pages have unique titles");
}
