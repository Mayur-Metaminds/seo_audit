"use client";

import { useEffect, useState, useCallback } from "react";
import type { AuditReport } from "@/types/audit.types";
import { AuditProgress } from "./AuditProgress";
import { ScoreOverview } from "./ScoreOverview";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { ChecklistResults } from "./ChecklistResults";
import { PageReportTable } from "./PageReportTable";
import { Download, FileText, RefreshCw } from "lucide-react";

interface AuditReportViewProps {
  auditId: string;
}

export function AuditReportView({ auditId }: AuditReportViewProps) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit/${auditId}`);
      if (!res.ok) throw new Error("Audit not found");
      const data: AuditReport = await res.json();
      setReport(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit");
      return null;
    }
  }, [auditId]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function poll() {
      const data = await fetchReport();
      if (data && (data.status === "completed" || data.status === "failed")) {
        clearInterval(interval);
      }
    }

    poll();
    interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [fetchReport]);

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (report.status === "running" || report.status === "pending") {
    return <AuditProgress report={report} />;
  }

  if (report.status === "failed") {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-6">
        <h2 className="text-lg font-semibold text-danger mb-2">Audit Failed</h2>
        <p className="text-muted">{report.error || "An unknown error occurred."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Report</h1>
          <p className="text-muted mt-1 font-mono text-sm">{report.url}</p>
        </div>
        <div className="flex gap-3">
          <a
            href={`/api/export/${auditId}`}
            download
            className="inline-flex items-center gap-2 rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </a>
          <a
            href={`/api/export/${auditId}?format=markdown`}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium hover:bg-card-border/30 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Markdown
          </a>
          <button
            onClick={() => fetchReport()}
            className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium hover:bg-card-border/30 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <ScoreOverview report={report} />
      <CategoryBreakdown categories={report.categoryScores} />
      <ChecklistResults categories={report.categoryScores} />
      <PageReportTable pages={report.pageResults} />
    </div>
  );
}
