"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuditReport } from "@/types/audit.types";
import { ScoreOverview } from "./ScoreOverview";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { ChecklistResults } from "./ChecklistResults";
import { PageReportTable } from "./PageReportTable";
import { RemainingPagesList } from "./RemainingPagesList";
import { loadReport } from "@/lib/audit/reportCache";
import { generateMarkdownReport } from "@/lib/audit/reportExport";
import { generatePdfReport } from "@/lib/audit/reportPdf";
import { Download, FileText, ArrowLeft, Loader2 } from "lucide-react";

interface AuditReportViewProps {
  auditId: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadExport(report: AuditReport, format: "pdf" | "markdown") {
  const dateStr = new Date().toISOString().slice(0, 10);
  const base = `seo-audit-${report.domain}-${dateStr}`;

  if (format === "markdown") {
    const md = generateMarkdownReport(report);
    triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${base}.md`);
    return;
  }

  const pdf = generatePdfReport(report);
  const bytes = new Uint8Array(pdf);
  triggerDownload(new Blob([bytes], { type: "application/pdf" }), `${base}.pdf`);
}

export function AuditReportView({ auditId }: AuditReportViewProps) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "markdown" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const stored = await loadReport(auditId);
      if (cancelled) return;
      if (!stored) {
        setError("Report not found in this browser. Run a new audit from the home page.");
        return;
      }
      setReport(stored);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  async function handleExport(format: "pdf" | "markdown") {
    if (!report) return;
    setExporting(format);
    setError("");
    try {
      await downloadExport(report, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  if (error && !report) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center space-y-4">
        <p className="text-danger">{error}</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Run a new audit
        </Link>
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

  if (report.status === "failed") {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-6">
        <h2 className="text-lg font-semibold text-danger mb-2">Audit Failed</h2>
        <p className="text-muted">{report.error || "An unknown error occurred."}</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-accent hover:underline mt-4">
          <ArrowLeft className="h-4 w-4" />
          Try again
        </Link>
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
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={!!exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport("markdown")}
            disabled={!!exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium hover:bg-card-border/30 transition-colors disabled:opacity-50"
          >
            {exporting === "markdown" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Markdown
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium hover:bg-card-border/30 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            New Audit
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <ScoreOverview report={report} />
      <RemainingPagesList report={report} />
      <CategoryBreakdown categories={report.categoryScores} />
      <ChecklistResults categories={report.categoryScores} />
      <PageReportTable pages={report.pageResults} />
    </div>
  );
}
