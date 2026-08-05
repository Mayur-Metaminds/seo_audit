"use client";

import { useState, type ReactNode } from "react";
import type { AuditReport, CheckResult } from "@/types/audit.types";
import { cn } from "@/lib/utils/cn";
import { AlertTriangle, CheckCircle2, XCircle, Eye, Code2, ArrowDownRight } from "lucide-react";
import { SolutionModal } from "./SolutionModal";
import { getGrade } from "@/data/framework";

const gradeConfig = {
  elite: { label: "Elite", color: "text-success", bg: "bg-success/10 border-success/30" },
  good: { label: "Good", color: "text-accent", bg: "bg-accent/10 border-accent/30" },
  "needs-work": { label: "Needs Work", color: "text-warning", bg: "bg-warning/10 border-warning/30" },
  critical: { label: "Critical", color: "text-danger", bg: "bg-danger/10 border-danger/30" },
};

export function ScoreOverview({ report }: { report: AuditReport }) {
  // Number + tag always from the same 0–100 %
  const percentage =
    typeof report.scorePercentage === "number"
      ? report.scorePercentage
      : report.maxScore > 0
        ? Math.round((report.overallScore / report.maxScore) * 100)
        : 0;
  // Derive label from shown % so "21" can never be tagged Good
  const grade = gradeConfig[getGrade(percentage)];
  const [selectedIssue, setSelectedIssue] = useState<{ check?: CheckResult; checkpointId?: number } | null>(null);

  const allChecks: CheckResult[] = [
    ...(report.siteChecks || []),
    ...(report.categoryScores ? report.categoryScores.flatMap((c) => c.checks) : []),
  ];

  const handleViewSolution = (issueText: string) => {
    const match = issueText.match(/^#(\d+)/);
    const checkpointId = match ? parseInt(match[1], 10) : undefined;
    const foundCheck = checkpointId ? allChecks.find((c) => c.checkpointId === checkpointId) : undefined;

    setSelectedIssue({ check: foundCheck, checkpointId });
  };

  const handleScrollToIssue = (issueText: string) => {
    const match = issueText.match(/^#(\d+)/);
    if (!match) return;
    const checkpointId = Number(match[1]);
    window.dispatchEvent(
      new CustomEvent("seo-jump-checkpoint", { detail: { checkpointId } })
    );
    // Fallback if checklist already expanded
    setTimeout(() => {
      const el = document.getElementById(`checkpoint-${checkpointId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-accent");
        setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 2500);
      }
    }, 120);
  };

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={cn("rounded-2xl border p-6 lg:col-span-1", grade.bg)}>
          <p className="text-sm text-muted mb-1">Overall Score</p>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-5xl font-bold tabular-nums", grade.color)}>{percentage}</span>
            <span className="text-muted text-lg">/ 100</span>
          </div>
          <p className={cn("text-sm font-medium mt-2", grade.color)}>{grade.label}</p>
          <p className="text-xs text-muted mt-1">
            {report.overallScore} / {report.maxScore} applicable points
          </p>
          <p className="text-[11px] text-muted mt-1.5 leading-snug">
            Elite 90+ · Good 70–89 · Needs work 50–69 · Critical &lt;50
          </p>
        </div>

        <div className="rounded-2xl border border-card-border bg-card p-6 lg:col-span-2">
          <p className="text-sm text-muted mb-4">Audit Summary</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryStat icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Passed" value={report.summary.passed} />
            <SummaryStat icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="Warnings" value={report.summary.warnings} />
            <SummaryStat icon={<XCircle className="h-4 w-4 text-danger" />} label="Failed" value={report.summary.failed} />
            <SummaryStat icon={<Eye className="h-4 w-4 text-accent" />} label="Manual" value={report.summary.manual} />
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted">Pages audited:</span>{" "}
              <span className="font-medium">{report.pagesAudited}</span>
            </div>
            <div>
              <span className="text-muted">Total discovered:</span>{" "}
              <span className="font-medium">{report.totalPagesFound}</span>
            </div>
            <div>
              <span className="text-muted">Remaining:</span>{" "}
              <span className="font-medium">{(report.remainingUrls || []).length}</span>
            </div>
          </div>
        </div>

        {report.summary.topIssues.length > 0 && (
          <div className="rounded-2xl border border-card-border bg-card p-6 lg:col-span-3">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Priority findings
            </h3>

            <ul className="space-y-2">
              {report.summary.topIssues.map((issue, i) => {
                const match = issue.match(/^#(\d+)/);
                const checkpointId = match ? Number(match[1]) : undefined;
                const foundCheck = checkpointId
                  ? allChecks.find((c) => c.checkpointId === checkpointId)
                  : undefined;
                const isFail = foundCheck?.status === "fail" || (!foundCheck && !/warn/i.test(issue));

                return (
                  <li
                    key={i}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-l-[3px]",
                      isFail
                        ? "bg-danger/10 border-danger/25 border-l-danger"
                        : "bg-amber-500/10 border-amber-500/25 border-l-amber-500"
                    )}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border mt-0.5",
                          isFail
                            ? "bg-danger/15 text-danger border-danger/30"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        )}
                      >
                        {isFail ? "Issue" : "Warning"}
                        {checkpointId ? ` #${checkpointId}` : ""}
                      </span>
                      <span className="text-sm text-foreground/90 font-mono leading-relaxed truncate">
                        {issue.replace(/^#\d+\s*/, "")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleScrollToIssue(issue)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-card-border text-xs text-muted hover:text-foreground"
                        title="Jump to checklist"
                        aria-label="Jump to checklist item"
                      >
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleViewSolution(issue)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors",
                          isFail
                            ? "bg-danger/15 text-danger border-danger/30 hover:bg-danger/25"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                        )}
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        Solution
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <SolutionModal
        check={selectedIssue?.check}
        checkpointId={selectedIssue?.checkpointId}
        isOpen={!!selectedIssue}
        onClose={() => setSelectedIssue(null)}
        pageUrl={report.url}
      />
    </>
  );
}

function SummaryStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted">{label}</span>
      </div>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
    </div>
  );
}
