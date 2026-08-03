import type { AuditReport, CheckOccurrence, CheckResult, PageAuditResult } from "@/types/audit.types";

const CODE_LIMIT = 3200;
const EVIDENCE_LIMIT = 10;
const OCCURRENCE_LIMIT = 40;

function slimOccurrence(occ: CheckOccurrence): CheckOccurrence {
  return {
    url: occ.url,
    status: occ.status,
    message: occ.message.slice(0, 500),
    evidence: occ.evidence?.slice(0, 5).map((e) => e.slice(0, 200)),
    issueCode: occ.issueCode?.slice(0, CODE_LIMIT),
    solutionCode: occ.solutionCode?.slice(0, CODE_LIMIT),
    recommendation: occ.recommendation?.slice(0, 500),
    suggestion: occ.suggestion?.slice(0, 500),
    codeLocation: occ.codeLocation?.slice(0, 200),
    whyItMatters: occ.whyItMatters?.slice(0, 800),
    seoImpact: occ.seoImpact,
    howToVerify: occ.howToVerify?.slice(0, 500),
    rankingEffect: occ.rankingEffect?.slice(0, 400),
    confidence: occ.confidence,
    isGenuineSeoIssue: occ.isGenuineSeoIssue,
    measuredValue: occ.measuredValue,
    measuredUnit: occ.measuredUnit,
  };
}

function slimCheck(check: CheckResult): CheckResult {
  return {
    checkpointId: check.checkpointId,
    status: check.status,
    score: check.score,
    maxScore: check.maxScore,
    message: check.message.slice(0, 500),
    recommendation: check.recommendation?.slice(0, 500),
    suggestion: check.suggestion?.slice(0, 500),
    evidence: check.evidence?.slice(0, EVIDENCE_LIMIT).map((e) => e.slice(0, 200)),
    affectedUrls: check.affectedUrls?.slice(0, OCCURRENCE_LIMIT),
    scope: check.scope,
    codeLocation: check.codeLocation?.slice(0, 200),
    issueCode: check.issueCode?.slice(0, CODE_LIMIT),
    solutionCode: check.solutionCode?.slice(0, CODE_LIMIT),
    occurrences: check.occurrences?.slice(0, OCCURRENCE_LIMIT).map(slimOccurrence),
    whyItMatters: check.whyItMatters?.slice(0, 800),
    seoImpact: check.seoImpact,
    howToVerify: check.howToVerify?.slice(0, 500),
    rankingEffect: check.rankingEffect?.slice(0, 400),
    confidence: check.confidence,
    isGenuineSeoIssue: check.isGenuineSeoIssue,
    measuredValue: check.measuredValue,
    measuredUnit: check.measuredUnit,
  };
}

function slimPage(page: PageAuditResult): PageAuditResult {
  const problemChecks = (page.checks || [])
    .filter((c) => c.status === "fail" || c.status === "warn")
    .slice(0, 40)
    .map(slimCheck);

  return {
    url: page.url,
    statusCode: page.statusCode,
    responseTimeMs: page.responseTimeMs,
    pageSizeBytes: page.pageSizeBytes,
    score: page.score,
    issues: page.issues.slice(0, 40).map((i) => i.slice(0, 300)),
    // Keep fail/warn checks so per-page findings can open genuine solution modals
    checks: problemChecks,
  };
}

/** Strip heavy duplicate fields so the report fits browser storage and API responses. */
export function slimReport(report: AuditReport): AuditReport {
  return {
    ...report,
    remainingUrls: (report.remainingUrls || []).slice(0, 5000),
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
