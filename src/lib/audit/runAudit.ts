import type { AuditConfig, AuditReport } from "@/types/audit.types";
import { crawlSite, checkSensitiveFiles, check404Page, findHomepage } from "@/lib/crawler/siteCrawler";
import { auditPage, auditPerformance, auditAssets, auditSecurity, auditEeat } from "@/lib/auditors";
import {
  auditBrokenLinks,
  auditDuplicateMeta,
  auditArchitectureExtras,
  auditHttpProtocol,
  audit404Ux,
  auditManualIntegrations,
  auditOrphanPages,
  auditDuplicateTitles,
} from "@/lib/auditors/siteChecks";
import { auditSiteLevel } from "@/lib/auditors/siteLevel";
import { buildPageResults, finalizeReport } from "@/lib/audit/scoring";
import { getDomain, generateId } from "@/lib/utils/url";
import { getTotalMaxScore } from "@/data/framework";

export async function runAudit(url: string, config: AuditConfig): Promise<AuditReport> {
  const id = generateId();
  const origin = new URL(url).origin;

  let report: AuditReport = {
    id,
    url,
    domain: getDomain(url),
    startedAt: new Date().toISOString(),
    status: "running",
    progress: { phase: "crawling", current: 0, total: 0, message: "Crawling site pages..." },
    config,
    pagesAudited: 0,
    totalPagesFound: 0,
    pageResults: [],
    siteChecks: [],
    categoryScores: [],
    overallScore: 0,
    maxScore: getTotalMaxScore(),
    grade: "critical",
    summary: { passed: 0, warnings: 0, failed: 0, manual: 0, topIssues: [], strengths: [] },
  };

  try {
    const crawl = await crawlSite(url, config);

    const [sensitiveFiles, notFoundCheck] = await Promise.all([
      checkSensitiveFiles(origin),
      check404Page(origin),
    ]);

    const homepage = findHomepage(crawl.pages, url);

    const allChecks = [];
    const pageData = [];

    for (const page of crawl.pages) {
      if (page.statusCode === 0) continue;

      const pageChecks = [...auditPage(page, url), ...auditPerformance(page), ...auditAssets(page)];

      pageData.push({
        url: page.url,
        finalUrl: page.finalUrl,
        statusCode: page.statusCode,
        responseTimeMs: page.ttfbMs || page.responseTimeMs,
        contentLength: page.contentLength,
        checks: pageChecks,
      });

      allChecks.push(...pageChecks);
    }

    const siteChecks = [
      ...auditSiteLevel(crawl, url),
      auditOrphanPages(crawl, url),
      auditDuplicateTitles(crawl),
      auditDuplicateMeta(crawl),
      auditBrokenLinks(crawl, url),
      ...auditArchitectureExtras(crawl, url),
      auditHttpProtocol(homepage),
      audit404Ux(notFoundCheck),
      ...auditManualIntegrations(),
    ];

    const securityChecks = auditSecurity(
      homepage || crawl.pages[0] || ({ headers: {}, html: "" } as never),
      sensitiveFiles,
      notFoundCheck
    );
    const eeatChecks = auditEeat(crawl);

    allChecks.push(...siteChecks, ...securityChecks, ...eeatChecks);

    report = {
      ...report,
      pagesAudited: crawl.pages.length,
      totalPagesFound: crawl.allDiscoveredUrls.length,
    };

    return finalizeReport(report, allChecks, buildPageResults(pageData));
  } catch (error) {
    return {
      ...report,
      status: "failed",
      error: error instanceof Error ? error.message : "Audit failed",
      progress: { phase: "failed", current: 0, total: 0, message: "Audit failed" },
    };
  }
}
