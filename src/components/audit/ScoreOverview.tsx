"use client";

import { useState } from "react";
import type { AuditReport, CheckResult } from "@/types/audit.types";
import { cn } from "@/lib/utils/cn";
import { AlertTriangle, CheckCircle2, XCircle, Eye, Code2, ArrowDownRight } from "lucide-react";
import { SolutionModal } from "./SolutionModal";

const gradeConfig = {
  elite: { label: "Elite", color: "text-success", bg: "bg-success/10 border-success/30" },
  good: { label: "Good", color: "text-accent", bg: "bg-accent/10 border-accent/30" },
  "needs-work": { label: "Needs Work", color: "text-warning", bg: "bg-warning/10 border-warning/30" },
  critical: { label: "Critical", color: "text-danger", bg: "bg-danger/10 border-danger/30" },
};

export function ScoreOverview({ report }: { report: AuditReport }) {
  const percentage = report.maxScore > 0 ? Math.round((report.overallScore / report.maxScore) * 100) : 0;
  const grade = gradeConfig[report.grade];
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
    const id = match[1];
    const el = document.getElementById(`checkpoint-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent");
      setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 2500);
    }
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
            {report.overallScore} / {report.maxScore} points
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
          <div className="rounded-2xl border border-danger/30 bg-danger/5 p-6 lg:col-span-3">
            <h3 className="text-base font-bold text-danger mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger shrink-0" />
              Priority Issues for Developers
            </h3>

            <ul className="space-y-3">
              {report.summary.topIssues.map((issue, i) => (
                <li
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-card-border/60 bg-card/60 hover:bg-card transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-danger shrink-0 font-bold mt-0.5">•</span>
                    <span className="text-sm text-foreground/90 font-medium font-mono leading-relaxed truncate">{issue}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleViewSolution(issue)}
                    className="shrink-0 self-end sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors shadow-sm"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    View Issue
                  </button>
                </li>
              ))}
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

function SummaryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
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
