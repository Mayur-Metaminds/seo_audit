"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { CheckResult, PageAuditResult } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS } from "@/data/framework";
import { formatBytes, formatMs } from "@/lib/utils/url";
import { cn } from "@/lib/utils/cn";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Code2,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { SolutionModal } from "./SolutionModal";

function getPageCounts(page: PageAuditResult) {
  const checks = page.checks || [];
  let fails = checks.filter((c) => c.status === "fail").length;
  let warns = checks.filter((c) => c.status === "warn").length;

  if (checks.length === 0 && page.issues) {
    fails = page.issues.filter((i) => i.startsWith("[FAIL")).length;
    warns = page.issues.filter((i) => i.startsWith("[WARN")).length;
    if (fails === 0 && warns === 0 && page.issues.length > 0) {
      fails = page.issues.length;
    }
  }

  return { fails, warns, total: fails + warns };
}

function parseIssueLine(line: string): {
  status: "fail" | "warn";
  checkpointId: number;
  message: string;
} | null {
  const m = line.match(/^\[(FAIL|WARN)\s+#(\d+)\]\s*(.*)$/i);
  if (!m) return null;
  return {
    status: m[1].toUpperCase() === "FAIL" ? "fail" : "warn",
    checkpointId: Number(m[2]),
    message: m[3] || line,
  };
}

function findingFromIssueLine(
  line: string,
  pageUrl: string,
  catalog: Map<number, CheckResult>
): CheckResult | null {
  const parsed = parseIssueLine(line);
  if (!parsed) return null;
  const fromCatalog = catalog.get(parsed.checkpointId);
  const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === parsed.checkpointId);

  return {
    checkpointId: parsed.checkpointId,
    status: parsed.status,
    score: fromCatalog?.score ?? 0,
    maxScore: fromCatalog?.maxScore ?? cp?.maxScore ?? 5,
    message: parsed.message || fromCatalog?.message || cp?.name || line,
    recommendation: fromCatalog?.recommendation || cp?.suggestion,
    suggestion: fromCatalog?.suggestion || cp?.suggestion,
    evidence: fromCatalog?.evidence,
    issueCode: fromCatalog?.issueCode || cp?.issueCode,
    solutionCode: fromCatalog?.solutionCode || cp?.solutionCode,
    codeLocation: fromCatalog?.codeLocation || cp?.codeLocation,
    whyItMatters: fromCatalog?.whyItMatters,
    seoImpact: fromCatalog?.seoImpact,
    howToVerify: fromCatalog?.howToVerify,
    rankingEffect: fromCatalog?.rankingEffect,
    confidence: fromCatalog?.confidence || "medium",
    isGenuineSeoIssue: parsed.status === "fail" || fromCatalog?.isGenuineSeoIssue,
    affectedUrls: [pageUrl],
    occurrences: fromCatalog?.occurrences?.filter((o) => o.url === pageUrl) || [
      {
        url: pageUrl,
        status: parsed.status,
        message: parsed.message,
        issueCode: fromCatalog?.issueCode || cp?.issueCode,
        solutionCode: fromCatalog?.solutionCode || cp?.solutionCode,
        recommendation: fromCatalog?.recommendation || cp?.suggestion,
        suggestion: fromCatalog?.suggestion || cp?.suggestion,
        evidence: fromCatalog?.evidence,
        whyItMatters: fromCatalog?.whyItMatters,
        seoImpact: fromCatalog?.seoImpact,
        howToVerify: fromCatalog?.howToVerify,
        confidence: fromCatalog?.confidence || "medium",
        isGenuineSeoIssue: parsed.status === "fail",
      },
    ],
    scope: "page",
  };
}

export function PageReportTable({
  pages,
  catalogChecks = [],
}: {
  pages: PageAuditResult[];
  /** Aggregated checks used to enrich solutions when page checks were slimmed. */
  catalogChecks?: CheckResult[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "issues" | "warnings" | "clean">("all");
  const [activeCheck, setActiveCheck] = useState<{
    check?: CheckResult;
    checkpointId?: number;
    pageUrl?: string;
  } | null>(null);

  const catalog = useMemo(() => {
    const map = new Map<number, CheckResult>();
    for (const c of catalogChecks) map.set(c.checkpointId, c);
    return map;
  }, [catalogChecks]);

  const pagesWithFails = pages.filter((p) => getPageCounts(p).fails > 0);
  const pagesWithWarns = pages.filter((p) => getPageCounts(p).fails === 0 && getPageCounts(p).warns > 0);
  const cleanPages = pages.filter((p) => getPageCounts(p).total === 0);

  const filtered =
    filter === "issues"
      ? pagesWithFails
      : filter === "warnings"
        ? pagesWithWarns
        : filter === "clean"
          ? cleanPages
          : pages;

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Per-Page Audit Results</h2>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} tone="accent">
            All ({pages.length})
          </FilterChip>
          <FilterChip active={filter === "issues"} onClick={() => setFilter("issues")} tone="danger">
            Issues ({pagesWithFails.length})
          </FilterChip>
          <FilterChip active={filter === "warnings"} onClick={() => setFilter("warnings")} tone="warn">
            Warnings ({pagesWithWarns.length})
          </FilterChip>
          <FilterChip active={filter === "clean"} onClick={() => setFilter("clean")} tone="ok">
            Clean ({cleanPages.length})
          </FilterChip>
        </div>
      </div>

      <div className="rounded-xl border border-card-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-muted bg-background/50 text-xs font-medium">
                <th className="p-3 w-8" />
                <th className="p-3">Page</th>
                <th className="p-3">HTTP</th>
                <th className="p-3">TTFB</th>
                <th className="p-3">Size</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {filtered.length > 0 ? (
                filtered.map((page) => (
                  <PageRow
                    key={page.url}
                    page={page}
                    catalog={catalog}
                    expanded={expanded === page.url}
                    onToggle={() => setExpanded(expanded === page.url ? null : page.url)}
                    onViewSolution={(c, url) =>
                      setActiveCheck({ check: c, checkpointId: c?.checkpointId, pageUrl: url })
                    }
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted font-medium">
                    No pages found matching current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeCheck && (
        <SolutionModal
          check={activeCheck.check}
          checkpointId={activeCheck.checkpointId}
          isOpen={!!activeCheck}
          onClose={() => setActiveCheck(null)}
          pageUrl={activeCheck.pageUrl}
        />
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "accent" | "danger" | "warn" | "ok";
  children: ReactNode;
}) {
  const activeCls =
    tone === "danger"
      ? "bg-danger/15 text-danger border-danger/30"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : tone === "ok"
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-accent/15 text-accent border-accent/30";
  const idleCls =
    tone === "danger"
      ? "border-card-border bg-card text-danger/70 hover:bg-danger/10"
      : tone === "warn"
        ? "border-card-border bg-card text-amber-400/70 hover:bg-amber-500/10"
        : tone === "ok"
          ? "border-card-border bg-card text-emerald-400/70 hover:bg-emerald-500/10"
          : "border-card-border bg-card text-muted hover:bg-background/50";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg border transition-colors",
        active ? activeCls : idleCls
      )}
    >
      {children}
    </button>
  );
}

function PageRow({
  page,
  catalog,
  expanded,
  onToggle,
  onViewSolution,
}: {
  page: PageAuditResult;
  catalog: Map<number, CheckResult>;
  expanded: boolean;
  onToggle: () => void;
  onViewSolution: (c: CheckResult | undefined, url: string) => void;
}) {
  const { fails, warns } = getPageCounts(page);
  const path = page.url.replace(/^https?:\/\/[^/]+/, "") || "/";

  const findings: CheckResult[] = useMemo(() => {
    const enrich = (c: CheckResult): CheckResult => {
      const fromCatalog = catalog.get(c.checkpointId);
      const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === c.checkpointId);
      if (c.solutionCode || c.issueCode) {
        return {
          ...c,
          affectedUrls: c.affectedUrls?.length ? c.affectedUrls : [page.url],
          whyItMatters: c.whyItMatters || fromCatalog?.whyItMatters,
          seoImpact: c.seoImpact || fromCatalog?.seoImpact,
          howToVerify: c.howToVerify || fromCatalog?.howToVerify,
        };
      }
      return {
        ...c,
        recommendation: c.recommendation || fromCatalog?.recommendation || cp?.suggestion,
        suggestion: c.suggestion || fromCatalog?.suggestion || cp?.suggestion,
        issueCode: c.issueCode || fromCatalog?.issueCode || cp?.issueCode,
        solutionCode: c.solutionCode || fromCatalog?.solutionCode || cp?.solutionCode,
        codeLocation: c.codeLocation || fromCatalog?.codeLocation || cp?.codeLocation,
        whyItMatters: c.whyItMatters || fromCatalog?.whyItMatters,
        seoImpact: c.seoImpact || fromCatalog?.seoImpact,
        howToVerify: c.howToVerify || fromCatalog?.howToVerify,
        rankingEffect: c.rankingEffect || fromCatalog?.rankingEffect,
        confidence: c.confidence || fromCatalog?.confidence || "medium",
        isGenuineSeoIssue: c.isGenuineSeoIssue ?? (c.status === "fail" || c.status === "warn"),
        affectedUrls: c.affectedUrls?.length ? c.affectedUrls : [page.url],
        evidence: c.evidence?.length ? c.evidence : fromCatalog?.evidence,
      };
    };

    if (page.checks && page.checks.length > 0) {
      return page.checks
        .filter((c) => c.status === "fail" || c.status === "warn")
        .map(enrich)
        .sort((a, b) => (a.status === b.status ? a.checkpointId - b.checkpointId : a.status === "fail" ? -1 : 1));
    }
    return (page.issues || [])
      .map((line) => findingFromIssueLine(line, page.url, catalog))
      .filter((c): c is CheckResult => Boolean(c))
      .sort((a, b) => (a.status === b.status ? a.checkpointId - b.checkpointId : a.status === "fail" ? -1 : 1));
  }, [page, catalog]);

  const failFindings = findings.filter((f) => f.status === "fail");
  const warnFindings = findings.filter((f) => f.status === "warn");

  return (
    <>
      <tr className="hover:bg-background/40 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="p-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
        </td>
        <td className="p-3 max-w-xs">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-foreground hover:text-accent truncate flex items-center gap-1 group"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{path}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
          </a>
        </td>
        <td className="p-3">
          <span
            className={cn(
              "text-xs font-mono px-2 py-0.5 rounded border",
              page.statusCode === 200
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                : "bg-danger/10 text-danger border-danger/25"
            )}
          >
            {page.statusCode}
          </span>
        </td>
        <td className="p-3 font-mono text-xs text-muted">{formatMs(page.responseTimeMs)}</td>
        <td className="p-3 font-mono text-xs text-muted">{formatBytes(page.pageSizeBytes)}</td>
        <td className="p-3">
          <div className="flex flex-wrap gap-1.5">
            {fails > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-danger/15 border border-danger/30 text-danger">
                <AlertOctagon className="h-3 w-3" />
                {fails} issue{fails > 1 ? "s" : ""}
              </span>
            )}
            {warns > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {warns} warning{warns > 1 ? "s" : ""}
              </span>
            )}
            {fails === 0 && warns === 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Clean
              </span>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={6} className="p-4 bg-background/40 border-b border-card-border space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted">Findings</span>
              <span className="text-xs font-mono text-muted/70 truncate">{path}</span>
            </div>

            {findings.length === 0 ? (
              <p className="text-xs text-muted">No issues or warnings on this page.</p>
            ) : (
              <div className="space-y-4 max-h-[28rem] overflow-y-auto overscroll-contain pr-1">
                {failFindings.length > 0 && (
                  <FindingGroup
                    title="Issues"
                    tone="fail"
                    items={failFindings}
                    pageUrl={page.url}
                    onViewSolution={onViewSolution}
                  />
                )}
                {warnFindings.length > 0 && (
                  <FindingGroup
                    title="Warnings"
                    tone="warn"
                    items={warnFindings}
                    pageUrl={page.url}
                    onViewSolution={onViewSolution}
                  />
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function FindingGroup({
  title,
  tone,
  items,
  pageUrl,
  onViewSolution,
}: {
  title: string;
  tone: "fail" | "warn";
  items: CheckResult[];
  pageUrl: string;
  onViewSolution: (c: CheckResult | undefined, url: string) => void;
}) {
  const isFail = tone === "fail";

  return (
    <div className="space-y-2">
      <p
        className={cn(
          "text-xs font-medium flex items-center gap-1.5",
          isFail ? "text-danger" : "text-amber-400"
        )}
      >
        {isFail ? <AlertOctagon className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {title}
        <span className="opacity-70">· {items.length}</span>
      </p>

      <div className="space-y-1.5">
        {items.map((check) => {
          const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === check.checkpointId);
          return (
            <div
              key={`${check.checkpointId}-${check.message}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 border-l-[3px]",
                isFail
                  ? "bg-danger/10 border-danger/25 border-l-danger"
                  : "bg-amber-500/10 border-amber-500/25 border-l-amber-500"
              )}
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                      isFail
                        ? "bg-danger/15 text-danger border-danger/30"
                        : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    )}
                  >
                    {isFail ? "Issue" : "Warning"} #{check.checkpointId}
                  </span>
                  <span className="text-xs text-foreground truncate">
                    {cp?.name || check.message}
                  </span>
                </div>
                {cp?.name && check.message !== cp.name && (
                  <p className="text-[11px] text-muted truncate">{check.message}</p>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewSolution(check, pageUrl);
                }}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors",
                  isFail
                    ? "bg-danger/15 text-danger border-danger/30 hover:bg-danger/25"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                )}
              >
                <Code2 className="h-3.5 w-3.5" />
                Solution
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
