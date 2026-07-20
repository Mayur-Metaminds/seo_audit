import type { CheckResult } from "@/types/audit.types";
import type { CrawlResult } from "@/lib/crawler/siteCrawler";
import { getDomain, normalizeUrl } from "@/lib/utils/url";
import { findHomepage } from "@/lib/crawler/siteCrawler";

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

export function auditSiteLevel(crawl: CrawlResult, baseUrl: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const origin = new URL(baseUrl).origin;
  const { robots, sitemap } = crawl;

  if (!robots.exists) {
    checks.push(makeResult(1, "fail", 0, 5, "robots.txt not found or invalid", {
      recommendation: "Create robots.txt with sitemap pointer at site root.",
    }));
  } else {
    const blocksRoot = robots.disallows.includes("/");
    const hasSitemap = robots.sitemaps.length > 0 || sitemap.exists;
    if (blocksRoot) {
      checks.push(makeResult(1, "fail", 0, 5, "robots.txt blocks entire site (Disallow: /)", {
        evidence: robots.disallows,
        recommendation: "Remove Disallow: / immediately — this blocks all crawling.",
      }));
    } else if (!hasSitemap) {
      checks.push(makeResult(1, "warn", 3, 5, "robots.txt missing Sitemap directive", {
        recommendation: `Add 'Sitemap: ${origin}/sitemap.xml' to robots.txt.`,
      }));
    } else {
      checks.push(makeResult(1, "pass", 5, 5, "robots.txt valid with sitemap pointer", {
        evidence: robots.sitemaps.length ? robots.sitemaps : [sitemap.url],
      }));
    }
  }

  if (!sitemap.exists) {
    checks.push(makeResult(2, "fail", 0, 5, "XML sitemap not found", {
      recommendation: "Create and submit sitemap.xml listing all indexable URLs.",
      evidence: sitemap.errors.slice(0, 3),
    }));
  } else if (sitemap.urlCount === 0) {
    checks.push(makeResult(2, "fail", 1, 5, "Sitemap exists but contains no URLs", {
      evidence: [sitemap.url],
    }));
  } else if (sitemap.urlCount > 50000) {
    checks.push(makeResult(2, "warn", 3, 5, `Sitemap has ${sitemap.urlCount} URLs (should split >50k)`, {
      evidence: [`${sitemap.urlCount} URLs`],
    }));
  } else {
    checks.push(makeResult(2, "pass", 5, 5, `Sitemap found with ${sitemap.urlCount} URLs`, {
      evidence: [sitemap.url],
    }));
  }

  if (!baseUrl.startsWith("https://")) {
    checks.push(makeResult(19, "fail", 0, 5, "Site not served over HTTPS", {
      recommendation: "Enable SSL/TLS and redirect HTTP to HTTPS with 301.",
    }));
  } else {
    const homepage = findHomepage(crawl.pages, baseUrl);
    const hasHsts = homepage?.headers["strict-transport-security"];
    checks.push(
      makeResult(19, hasHsts ? "pass" : "warn", hasHsts ? 5 : 4, 5,
        hasHsts ? "HTTPS with HSTS header" : "HTTPS enabled but HSTS header missing",
        { evidence: hasHsts ? [hasHsts] : undefined }
      )
    );
  }

  const paramUrls = crawl.allDiscoveredUrls.filter((u) => new URL(u).search.length > 0);
  if (paramUrls.length > 10) {
    checks.push(makeResult(23, "warn", 3, 5, `${paramUrls.length} URLs with query parameters`, {
      evidence: paramUrls.slice(0, 3),
      recommendation: "Configure parameter handling in GSC; canonicalise or noindex duplicates.",
    }));
  } else {
    checks.push(makeResult(23, "pass", 5, 5, "Minimal parameter-based URL duplication"));
  }

  void getDomain(baseUrl);
  return checks;
}
