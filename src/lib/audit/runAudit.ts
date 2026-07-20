import { after } from "next/server";
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
import { saveReport, updateReport } from "@/lib/audit/store";
import { getTotalMaxScore } from "@/data/framework";

export async function runAudit(url: string, config: AuditConfig): Promise<string> {
  const id = generateId();

  const initialReport: AuditReport = {
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

  await saveReport(initialReport);

  after(async () => {
    try {
      await executeAudit(id, url, config);
    } catch (error) {
      await updateReport(id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Audit failed",
        progress: { phase: "failed", current: 0, total: 0, message: "Audit failed" },
      });
    }
  });

  return id;
}

async function executeAudit(id: string, url: string, config: AuditConfig): Promise<void> {
  const origin = new URL(url).origin;

  await updateReport(id, {
    progress: { phase: "crawling", current: 0, total: 0, message: "Crawling site pages..." },
  });

  const crawl = await crawlSite(url, config, async (current, total, pageUrl) => {
    await updateReport(id, {
      progress: { phase: "crawling", current, total, message: `Crawling: ${pageUrl}` },
      pagesAudited: current,
      totalPagesFound: total,
    });
  });

  await updateReport(id, {
    progress: { phase: "security", current: 0, total: 3, message: "Running security checks..." },
    totalPagesFound: crawl.allDiscoveredUrls.length,
  });

  const [sensitiveFiles, notFoundCheck] = await Promise.all([
    checkSensitiveFiles(origin),
    check404Page(origin),
  ]);

  const homepage = findHomepage(crawl.pages, url);

  await updateReport(id, {
    progress: { phase: "auditing", current: 0, total: crawl.pages.length, message: "Running SEO checks..." },
  });

  const allChecks = [];
  const pageData = [];

  for (let i = 0; i < crawl.pages.length; i++) {
    const page = crawl.pages[i];
    if (page.statusCode === 0) continue;

    await updateReport(id, {
      progress: {
        phase: "auditing",
        current: i + 1,
        total: crawl.pages.length,
        message: `Auditing: ${page.finalUrl}`,
      },
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

  const pageResults = buildPageResults(pageData);
  const current = await updateReport(id, { pagesAudited: crawl.pages.length });

  if (current) {
    const finalReport = finalizeReport(current, allChecks, pageResults);
    await saveReport(finalReport);
  }
}
