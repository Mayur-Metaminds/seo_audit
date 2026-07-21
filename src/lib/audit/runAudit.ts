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
import { isUnlimitedPages } from "@/lib/audit/limits";

export interface AuditProgressEvent {
  phase: "initializing" | "crawling" | "security" | "auditing" | "finalizing" | "complete" | "failed";
  current: number;
  total: number;
  remaining: number;
  discovered: number;
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
  const unlimited = isUnlimitedPages(config.maxPages);

  const emit = (
    event: Omit<AuditProgressEvent, "percent" | "remaining" | "discovered"> & {
      percent: number;
      remaining?: number;
      discovered?: number;
    }
  ) => {
    const percent = Math.min(100, Math.max(lastPercent, Math.round(event.percent)));
    lastPercent = percent;
    onProgress?.({
      ...event,
      percent,
      remaining: event.remaining ?? Math.max(0, (event.total || 0) - (event.current || 0)),
      discovered: event.discovered ?? event.total ?? 0,
    });
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
    remainingUrls: [],
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
      remaining: 0,
      discovered: 0,
      percent: 2,
      url,
      message: unlimited
        ? "Fetching robots.txt and sitemap (full site crawl)..."
        : `Fetching robots.txt and sitemap (cap ${config.maxPages} pages)...`,
    });

    const crawl = await crawlSite(url, config, (current, discovered, remaining, pageUrl) => {
      const denom = unlimited ? Math.max(discovered, current, 1) : Math.max(config.maxPages, 1);
      const crawlShare = Math.min(1, current / denom);
      emit({
        phase: "crawling",
        current,
        total: discovered,
        discovered,
        remaining,
        percent: 5 + crawlShare * 60,
        url: pageUrl,
        message: unlimited
          ? `Crawling ${current} done · ${remaining} remaining · ${discovered} found`
          : `Crawling ${current}/${config.maxPages} · ${discovered} found · ${remaining} left in queue`,
      });
    });

    emit({
      phase: "security",
      current: 0,
      total: 2,
      remaining: 2,
      discovered: crawl.allDiscoveredUrls.length,
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
      remaining: 0,
      discovered: crawl.allDiscoveredUrls.length,
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
      const remainingAudit = pagesToAudit.length - (i + 1);

      emit({
        phase: "auditing",
        current: i + 1,
        total: pagesToAudit.length,
        discovered: crawl.allDiscoveredUrls.length,
        remaining: remainingAudit + crawl.remainingUrls.length,
        percent: 74 + auditShare * 20,
        url: page.finalUrl || page.url,
        message: `Auditing ${i + 1}/${pagesToAudit.length} · ${remainingAudit} pages left to score`,
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
      remaining: crawl.remainingUrls.length,
      discovered: crawl.allDiscoveredUrls.length,
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
      remainingUrls: crawl.remainingUrls,
    };

    const finalReport = slimReport(finalizeReport(report, allChecks, buildPageResults(pageData)));

    if (finalReport.remainingUrls.length > 0) {
      finalReport.summary.topIssues = [
        `${finalReport.remainingUrls.length} URL(s) discovered but not audited yet — see Remaining Pages list.`,
        ...finalReport.summary.topIssues,
      ].slice(0, 15);
    }

    emit({
      phase: "complete",
      current: finalReport.pagesAudited,
      total: finalReport.totalPagesFound,
      discovered: finalReport.totalPagesFound,
      remaining: finalReport.remainingUrls.length,
      percent: 100,
      message:
        finalReport.remainingUrls.length > 0
          ? `Complete — ${finalReport.pagesAudited} audited, ${finalReport.remainingUrls.length} remaining`
          : `Complete — all ${finalReport.pagesAudited} discovered pages audited`,
    });

    return finalReport;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed";
    emit({
      phase: "failed",
      current: 0,
      total: 0,
      remaining: 0,
      discovered: 0,
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
