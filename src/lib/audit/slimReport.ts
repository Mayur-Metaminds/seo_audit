import type { AuditReport, CheckResult, PageAuditResult } from "@/types/audit.types";

function slimCheck(check: CheckResult): CheckResult {
  return {
    checkpointId: check.checkpointId,
    status: check.status,
    score: check.score,
    maxScore: check.maxScore,
    message: check.message.slice(0, 500),
    recommendation: check.recommendation?.slice(0, 500),
    evidence: check.evidence?.slice(0, 5).map((e) => e.slice(0, 200)),
    affectedUrls: check.affectedUrls?.slice(0, 10),
    scope: check.scope,
  };
}

function slimPage(page: PageAuditResult): PageAuditResult {
  return {
    url: page.url,
    statusCode: page.statusCode,
    responseTimeMs: page.responseTimeMs,
    pageSizeBytes: page.pageSizeBytes,
    score: page.score,
    issues: page.issues.slice(0, 25).map((i) => i.slice(0, 300)),
    // Per-page check arrays duplicate site-wide data and blow up payload size
    checks: [],
  };
}

/** Strip heavy duplicate fields so the report fits browser storage and API responses. */
export function slimReport(report: AuditReport): AuditReport {
  return {
    ...report,
    pageResults: report.pageResults.map(slimPage),
    siteChecks: report.siteChecks.map(slimCheck),
    categoryScores: report.categoryScores.map((cat) => ({
      ...cat,
      checks: cat.checks.map(slimCheck),
    })),
    summary: {
      ...report.summary,
      topIssues: report.summary.topIssues.slice(0, 15),
      strengths: report.summary.strengths.slice(0, 10),
    },
  };
}
