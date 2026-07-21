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
import { slimReport } from "@/lib/audit/slimReport";

export interface AuditProgressEvent {
  phase: "initializing" | "crawling" | "security" | "auditing" | "finalizing" | "complete" | "failed";
  current: number;
  total: number;
  percent: number;
  url?: string;
  message: string;
}

export type ProgressCallback = (event: AuditProgressEvent) => void;

export async function runAudit(
  url: string,
  config: AuditConfig,
  onProgress?: ProgressCallback
): Promise<AuditReport> {
  const id = generateId();
  const origin = new URL(url).origin;
  let lastPercent = 0;

  const emit = (event: Omit<AuditProgressEvent, "percent"> & { percent: number }) => {
    const percent = Math.min(100, Math.max(lastPercent, Math.round(event.percent)));
    lastPercent = percent;
    onProgress?.({ ...event, percent });
  };

  let report: AuditReport = {
    id,
    url,
    domain: getDomain(url),
    startedAt: new Date().toISOString(),
    status: "running",
    progress: { phase: "initializing", current: 0, total: 0, message: "Starting audit..." },
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
    emit({
      phase: "initializing",
      current: 0,
      total: 0,
      percent: 2,
      url,
      message: "Fetching robots.txt and sitemap...",
    });

    const crawl = await crawlSite(url, config, (current, total, pageUrl) => {
      const crawlShare = total > 0 ? current / total : 0;
      emit({
        phase: "crawling",
        current,
        total,
        percent: 5 + crawlShare * 60,
        url: pageUrl,
        message: `Crawling page ${current} of ${Math.max(total, current)}`,
      });
    });

    emit({
      phase: "security",
      current: 0,
      total: 2,
      percent: 68,
      url,
      message: "Running security and 404 checks...",
    });

    const [sensitiveFiles, notFoundCheck] = await Promise.all([
      checkSensitiveFiles(origin),
      check404Page(origin),
    ]);

    emit({
      phase: "security",
      current: 2,
      total: 2,
      percent: 72,
      url,
      message: "Security checks complete",
    });

    const homepage = findHomepage(crawl.pages, url);
    const pagesToAudit = crawl.pages.filter((p) => p.statusCode !== 0);

    const allChecks = [];
    const pageData = [];

    for (let i = 0; i < pagesToAudit.length; i++) {
      const page = pagesToAudit[i];
      const auditShare = pagesToAudit.length > 0 ? (i + 1) / pagesToAudit.length : 1;

      emit({
        phase: "auditing",
        current: i + 1,
        total: pagesToAudit.length,
        percent: 74 + auditShare * 20,
        url: page.finalUrl || page.url,
        message: `Auditing page ${i + 1} of ${pagesToAudit.length}`,
      });

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

    emit({
      phase: "finalizing",
      current: pagesToAudit.length,
      total: pagesToAudit.length,
      percent: 96,
      message: "Aggregating site-level checks and scoring...",
    });

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

    const finalReport = slimReport(finalizeReport(report, allChecks, buildPageResults(pageData)));

    emit({
      phase: "complete",
      current: finalReport.pagesAudited,
      total: finalReport.totalPagesFound,
      percent: 100,
      message: "Audit complete",
    });

    return finalReport;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed";
    emit({
      phase: "failed",
      current: 0,
      total: 0,
      percent: lastPercent,
      message,
    });

    return {
      ...report,
      status: "failed",
      error: message,
      progress: { phase: "failed", current: 0, total: 0, message: "Audit failed" },
    };
  }
}
