"use client";

import { useState } from "react";
import type { CheckResult, PageAuditResult } from "@/types/audit.types";
import { formatBytes, formatMs } from "@/lib/utils/url";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronRight, ExternalLink, AlertTriangle, AlertOctagon, CheckCircle2, Code2 } from "lucide-react";
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

export function PageReportTable({ pages }: { pages: PageAuditResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "issues" | "warnings" | "clean">("all");
  const [activeCheck, setActiveCheck] = useState<{ check?: CheckResult; checkpointId?: number; pageUrl?: string } | null>(null);

  const pagesWithFails = pages.filter((p) => getPageCounts(p).fails > 0);
  const pagesWithWarns = pages.filter((p) => getPageCounts(p).fails === 0 && getPageCounts(p).warns > 0);
  const cleanPages = pages.filter((p) => getPageCounts(p).total === 0);

  const filtered = filter === "issues"
    ? pagesWithFails
    : filter === "warnings"
    ? pagesWithWarns
    : filter === "clean"
    ? cleanPages
    : pages;

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">Per-Page Audit Results</h2>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg border transition-all shadow-sm",
              filter === "all"
                ? "bg-accent text-white border-accent"
                : "border-card-border bg-card text-muted hover:text-foreground hover:bg-card-border/40"
            )}
          >
            All ({pages.length})
          </button>

          <button
            type="button"
            onClick={() => setFilter("issues")}
            className={cn(
              "px-3 py-1.5 rounded-lg border transition-all shadow-sm",
              filter === "issues"
                ? "bg-danger text-white border-danger"
                : "border-card-border bg-card text-danger/80 hover:text-danger hover:bg-danger/10"
            )}
          >
            With Issues ({pagesWithFails.length})
          </button>

          <button
            type="button"
            onClick={() => setFilter("warnings")}
            className={cn(
              "px-3 py-1.5 rounded-lg border transition-all shadow-sm",
              filter === "warnings"
                ? "bg-amber-500 text-white border-amber-500"
                : "border-card-border bg-card text-amber-400/80 hover:text-amber-400 hover:bg-amber-500/10"
            )}
          >
            Warnings Only ({pagesWithWarns.length})
          </button>

          <button
            type="button"
            onClick={() => setFilter("clean")}
            className={cn(
              "px-3 py-1.5 rounded-lg border transition-all shadow-sm",
              filter === "clean"
                ? "bg-emerald-500 text-white border-emerald-500"
                : "border-card-border bg-card text-emerald-400/80 hover:text-emerald-400 hover:bg-emerald-500/10"
            )}
          >
            Clean ({cleanPages.length})
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-card-border bg-card overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-muted bg-background/50 text-xs font-semibold uppercase tracking-wider">
                <th className="p-3 w-8"></th>
                <th className="p-3">Page URL Path</th>
                <th className="p-3">HTTP</th>
                <th className="p-3">TTFB</th>
                <th className="p-3">Page Size</th>
                <th className="p-3">Issue Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {filtered.length > 0 ? (
                filtered.map((page) => (
                  <PageRow
                    key={page.url}
                    page={page}
                    expanded={expanded === page.url}
                    onToggle={() => setExpanded(expanded === page.url ? null : page.url)}
                    onViewSolution={(c, url) => setActiveCheck({ check: c, checkpointId: c?.checkpointId, pageUrl: url })}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted font-medium">
                    No pages found matching current filter filter.
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

function PageRow({
  page,
  expanded,
  onToggle,
  onViewSolution,
}: {
  page: PageAuditResult;
  expanded: boolean;
  onToggle: () => void;
  onViewSolution: (c: CheckResult | undefined, url: string) => void;
}) {
  const { fails, warns } = getPageCounts(page);
  const path = page.url.replace(/^https?:\/\/[^/]+/, "") || "/";

  return (
    <>
      <tr className="hover:bg-background/40 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="p-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted" />
          )}
        </td>
        <td className="p-3 max-w-xs">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs font-semibold text-foreground hover:text-accent truncate flex items-center gap-1 group"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{path}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
          </a>
        </td>
        <td className="p-3">
          <span
            className={cn(
              "text-xs font-mono font-bold px-2 py-0.5 rounded border",
              page.statusCode === 200
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                : "bg-danger/20 text-danger border-danger/30"
            )}
          >
            {page.statusCode}
          </span>
        </td>
        <td className="p-3 font-mono text-xs text-muted">{formatMs(page.responseTimeMs)}</td>
        <td className="p-3 font-mono text-xs text-muted">{formatBytes(page.pageSizeBytes)}</td>
        <td className="p-3">
          {fails > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-danger/20 border border-danger/30 text-danger font-semibold">
              <AlertOctagon className="h-3.5 w-3.5" />
              {fails} Issue{fails > 1 ? "s" : ""}
            </span>
          ) : warns > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              {warns} Warning{warns > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Clean
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="p-4 bg-background/40 border-b border-card-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">Detailed Page Audit Findings</span>
              <span className="text-xs font-mono text-muted">{path}</span>
            </div>

            {page.checks && page.checks.length > 0 ? (
              <div className="space-y-2">
                {page.checks
                  .filter((c) => c.status === "fail" || c.status === "warn")
                  .map((check, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center justify-between gap-3 p-2.5 rounded-lg border text-xs font-mono",
                        check.status === "fail"
                          ? "bg-danger/10 border-danger/30 text-foreground"
                          : "bg-amber-500/10 border-amber-500/30 text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn("font-bold px-1.5 py-0.5 rounded text-[10px]", check.status === "fail" ? "bg-danger text-white" : "bg-amber-500 text-white")}>
                          #{check.checkpointId} {check.status.toUpperCase()}
                        </span>
                        <span className="truncate">{check.message}</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewSolution(check, page.url);
                        }}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-white font-semibold hover:bg-accent-hover transition-colors shadow-xs"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        <span>View Fix</span>
                      </button>
                    </div>
                  ))}
              </div>
            ) : page.issues && page.issues.length > 0 ? (
              <ul className="space-y-1.5 font-mono text-xs text-muted">
                {page.issues.map((iss, i) => (
                  <li key={i} className="bg-card p-2 rounded border border-card-border">• {iss}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                All checks passed cleanly for this page!
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
