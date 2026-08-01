import type { AuditCategory, AuditReport, CategoryScore, CheckOccurrence, CheckResult, PageAuditResult } from "@/types/audit.types";
import { CATEGORY_LABELS, FRAMEWORK_CHECKPOINTS, getGrade, getCategoryMaxScores, getTotalMaxScore } from "@/data/framework";

function normalizeMessageKey(message: string): string {
  return message.replace(/\d+/g, "N").replace(/\s+/g, " ").trim().toLowerCase();
}

function summarizeFailMessages(fails: CheckResult[]): string {
  if (fails.length === 0) return "";
  if (fails.length === 1) return fails[0].message;

  const groups = new Map<string, { sample: string; count: number }>();
  for (const fail of fails) {
    const key = normalizeMessageKey(fail.message);
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { sample: fail.message, count: 1 });
  }

  if (groups.size === 1) {
    const only = [...groups.values()][0];
    return `${only.sample} (${fails.length} pages)`;
  }

  const parts = [...groups.values()].map((g) => `${g.count}× ${g.sample}`);
  return `${fails.length} pages with issues: ${parts.join("; ")}`;
}

function toOccurrence(check: CheckResult): CheckOccurrence | null {
  const url = check.affectedUrls?.[0];
  if (!url) return null;
  return {
    url,
    status: check.status,
    message: check.message,
    evidence: check.evidence,
    issueCode: check.issueCode,
    solutionCode: check.solutionCode,
    recommendation: check.recommendation,
    suggestion: check.suggestion,
    codeLocation: check.codeLocation,
    whyItMatters: check.whyItMatters,
    seoImpact: check.seoImpact,
    howToVerify: check.howToVerify,
    rankingEffect: check.rankingEffect,
    confidence: check.confidence,
    isGenuineSeoIssue: check.isGenuineSeoIssue,
    measuredValue: check.measuredValue,
    measuredUnit: check.measuredUnit,
  };
}

export function aggregateChecks(allChecks: CheckResult[]): Map<number, CheckResult> {
  const byCheckpoint = new Map<number, CheckResult[]>();

  for (const check of allChecks) {
    const existing = byCheckpoint.get(check.checkpointId) || [];
    existing.push(check);
    byCheckpoint.set(check.checkpointId, existing);
  }

  const aggregated = new Map<number, CheckResult>();

  for (const [id, checks] of byCheckpoint) {
    const fails = checks.filter((c) => c.status === "fail");
    const warns = checks.filter((c) => c.status === "warn");
    const manuals = checks.filter((c) => c.status === "manual");
    const passes = checks.filter((c) => c.status === "pass");
    const nas = checks.filter((c) => c.status === "na");

    let status: CheckResult["status"] = "pass";
    if (fails.length > 0) status = "fail";
    else if (warns.length > 0) status = "warn";
    else if (manuals.length > 0 && passes.length === 0 && nas.length === 0) status = "manual";
    else if (nas.length === checks.length) status = "na";

    const scorable = checks.filter((c) => c.status !== "manual");
    const avgScore =
      scorable.length > 0 ? scorable.reduce((sum, c) => sum + c.score, 0) / scorable.length : checks[0]?.score || 0;
    const maxScore = checks[0]?.maxScore || 5;

    const problemChecks = fails.length > 0 ? fails : warns.length > 0 ? warns : [];
    const affectedUrls = [...new Set(problemChecks.flatMap((c) => c.affectedUrls || []))];

    const occurrences: CheckOccurrence[] = [];
    const seenUrls = new Set<string>();
    for (const check of problemChecks) {
      if (check.occurrences?.length) {
        for (const occ of check.occurrences) {
          if (seenUrls.has(occ.url)) continue;
          seenUrls.add(occ.url);
          occurrences.push(occ);
        }
      } else {
        const occ = toOccurrence(check);
        if (occ && !seenUrls.has(occ.url)) {
          seenUrls.add(occ.url);
          occurrences.push(occ);
        }
      }
    }

    const primary = problemChecks[0] || manuals[0] || passes[0] || checks[0];
    const problemEvidence = [...new Set(problemChecks.flatMap((c) => c.evidence || []))].slice(0, 10);

    let message: string;
    if (fails.length > 0) message = summarizeFailMessages(fails);
    else if (warns.length > 0) message = summarizeFailMessages(warns);
    else message = primary?.message || checks[0].message;

    aggregated.set(id, {
      checkpointId: id,
      status,
      score: status === "manual" ? maxScore : Math.round(avgScore * 10) / 10,
      maxScore,
      message,
      recommendation:
        primary?.recommendation ||
        checks.find((c) => c.recommendation)?.recommendation,
      suggestion: primary?.suggestion || checks.find((c) => c.suggestion)?.suggestion,
      evidence: problemEvidence.length > 0 ? problemEvidence : primary?.evidence?.slice(0, 10),
      affectedUrls: affectedUrls.slice(0, 50),
      scope: checks.some((c) => c.scope === "site") ? "site" : "page",
      codeLocation: primary?.codeLocation,
      issueCode: occurrences.length === 1 ? occurrences[0].issueCode || primary?.issueCode : primary?.issueCode,
      solutionCode:
        occurrences.length === 1 ? occurrences[0].solutionCode || primary?.solutionCode : primary?.solutionCode,
      occurrences: occurrences.slice(0, 50),
      whyItMatters: primary?.whyItMatters,
      seoImpact: primary?.seoImpact,
      howToVerify: primary?.howToVerify,
      rankingEffect: primary?.rankingEffect,
      confidence: primary?.confidence,
      isGenuineSeoIssue: primary?.isGenuineSeoIssue,
      measuredValue: primary?.measuredValue,
      measuredUnit: primary?.measuredUnit,
    });
  }

  return aggregated;
}

function placeholderCheck(checkpointId: number): CheckResult {
  const cp = FRAMEWORK_CHECKPOINTS.find((c) => c.id === checkpointId);
  return {
    checkpointId,
    status: "na",
    score: cp?.maxScore || 5,
    maxScore: cp?.maxScore || 5,
    message: "Not evaluated during this audit run",
    scope: "site",
  };
}

export function buildCategoryScores(aggregated: Map<number, CheckResult>): CategoryScore[] {
  const categoryMaxScores = getCategoryMaxScores();
  const categories = Object.keys(CATEGORY_LABELS) as AuditCategory[];

  return categories.map((category) => {
    const checkpoints = FRAMEWORK_CHECKPOINTS.filter((c) => c.category === category);
    const checks = checkpoints.map((cp) => aggregated.get(cp.id) || placeholderCheck(cp.id));

    const scorable = checks.filter((c) => c.status !== "manual" && c.status !== "na");
    const score = scorable.reduce((sum, c) => sum + c.score, 0);
    const maxScore = categoryMaxScores[category];

    return {
      category,
      label: CATEGORY_LABELS[category],
      score: Math.round(score * 10) / 10,
      maxScore,
      percentage: maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0,
      checks,
    };
  });
}

export function buildPageResults(
  pages: {
    url: string;
    finalUrl: string;
    statusCode: number;
    responseTimeMs: number;
    contentLength: number;
    checks: CheckResult[];
  }[]
): PageAuditResult[] {
  return pages.map((page) => {
    const failed = page.checks.filter((c) => c.status === "fail");
    const warn = page.checks.filter((c) => c.status === "warn");

    const issues = [
      ...failed.map((c) => `[FAIL #${c.checkpointId}] ${c.message}`),
      ...warn.map((c) => `[WARN #${c.checkpointId}] ${c.message}`),
    ];

    return {
      url: page.finalUrl,
      statusCode: page.statusCode,
      responseTimeMs: page.responseTimeMs,
      pageSizeBytes: page.contentLength,
      checks: page.checks,
      score: Math.round(page.checks.reduce((sum, c) => sum + c.score, 0) * 10) / 10,
      issues,
    };
  });
}

export function buildSummary(aggregated: Map<number, CheckResult>): AuditReport["summary"] {
  const checks = [...aggregated.values()];
  const passed = checks.filter((c) => c.status === "pass").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const manual = checks.filter((c) => c.status === "manual").length;

  const topIssues = checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((a, b) => (a.status === "fail" ? -1 : 1) - (b.status === "fail" ? -1 : 1))
    .slice(0, 10)
    .map((c) => {
      const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === c.checkpointId);
      return `#${c.checkpointId} ${cp?.name || "Check"}: ${c.message}`;
    });

  const strengths = checks
    .filter((c) => c.status === "pass")
    .slice(0, 8)
    .map((c) => {
      const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === c.checkpointId);
      return `#${c.checkpointId} ${cp?.name || "Check"}: ${c.message}`;
    });

  return { passed, warnings, failed, manual, topIssues, strengths };
}

export function finalizeReport(
  report: AuditReport,
  allChecks: CheckResult[],
  pageResults: PageAuditResult[]
): AuditReport {
  const aggregated = aggregateChecks(allChecks);
  const categoryScores = buildCategoryScores(aggregated);
  const siteChecks = [...aggregated.values()].filter((c) => c.scope === "site");
  const totalScore = categoryScores.reduce((sum, c) => sum + c.score, 0);
  const maxScore = getTotalMaxScore();
  const scorableMax = categoryScores.reduce(
    (sum, cat) =>
      sum +
      cat.checks
        .filter((c) => c.status !== "manual" && c.status !== "na")
        .reduce((s, c) => s + c.maxScore, 0),
    0
  );
  const percentage = scorableMax > 0 ? (totalScore / scorableMax) * 100 : 0;

  return {
    ...report,
    status: "completed",
    completedAt: new Date().toISOString(),
    pageResults,
    siteChecks,
    categoryScores,
    overallScore: Math.round(totalScore * 10) / 10,
    maxScore,
    grade: getGrade(percentage),
    summary: buildSummary(aggregated),
    progress: {
      phase: "complete",
      current: pageResults.length,
      total: pageResults.length,
      message: "Audit complete",
    },
  };
}
