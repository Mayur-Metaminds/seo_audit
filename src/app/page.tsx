"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuditForm, type AuditMode } from "@/components/audit/AuditForm";
import { AuditProgress } from "@/components/audit/AuditProgress";
import { saveReport } from "@/lib/audit/reportCache";
import type { AuditProgressEvent } from "@/types/progress.types";
import { FRAMEWORK_CHECKPOINTS, CATEGORY_LABELS } from "@/data/framework";
import type { AuditReport } from "@/types/audit.types";
import { Search, FileText, BarChart3, Shield, Zap } from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Full Site Crawl",
    description: "Discovers pages via robots.txt + /sitemap.xml (Sitemap mode) or HTML link graph (Webflow mode), then audits each one.",
  },
  {
    icon: FileText,
    title: "55-Point Audit",
    description: "Full technical SEO and page speed checklist with crawlability, on-page, performance, and security checks.",
  },
  {
    icon: BarChart3,
    title: "Scored Report",
    description: "Category breakdown with pass/warn/fail status and developer-ready recommendations.",
  },
  {
    icon: Shield,
    title: "Security Checks",
    description: "Headers, sensitive file exposure, soft 404s, and HTTPS validation.",
  },
  {
    icon: Zap,
    title: "Performance Signals",
    description: "TTFB, page weight, script analysis, compression, and CWV proxies.",
  },
];

async function runStreamingAudit(
  url: string,
  mode: AuditMode,
  onProgress: (event: AuditProgressEvent) => void
): Promise<AuditReport> {
  const res = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ url, mode }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Audit request failed (${res.status})`);
  }

  if (!res.body) {
    throw new Error("No response stream from server");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let report: AuditReport | null = null;
  let streamError: string | null = null;
  let lastProgress: AuditProgressEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event: { type: string; [key: string]: unknown };
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (event.type === "progress") {
        const { type: _type, ...rest } = event;
        lastProgress = rest as unknown as AuditProgressEvent;
        onProgress(lastProgress);
      } else if (event.type === "complete") {
        report = event.report as AuditReport;
      } else if (event.type === "error") {
        streamError = String(event.error || "Audit failed");
      }
    }
  }

  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim());
      if (event.type === "complete") report = event.report as AuditReport;
      if (event.type === "error") streamError = String(event.error || "Audit failed");
      if (event.type === "progress") {
        const { type: _type, ...rest } = event;
        lastProgress = rest as unknown as AuditProgressEvent;
        onProgress(lastProgress);
      }
    } catch {
      // ignore trailing partial JSON (common when the function times out mid-stream)
    }
  }

  if (streamError) throw new Error(streamError);
  if (!report) {
    if (lastProgress) {
      throw new Error(
        `Server stopped before finishing. Last status: ${lastProgress.phase} — ${lastProgress.current} done, ${lastProgress.remaining ?? "?"} remaining of ${lastProgress.discovered || lastProgress.total || "?"} found. On Vercel set AUDIT_MAX_PAGES=150; on your own server leave it unlimited and keep the tab open until complete.`
      );
    }
    throw new Error(
      "Audit finished without a report (connection closed early). On a custom server, ensure the process is not timed out; on Vercel set AUDIT_MAX_PAGES=150."
    );
  }
  return report;
}

export default function HomePage() {
  const router = useRouter();
  const [auditUrl, setAuditUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<AuditProgressEvent | null>(null);
  const [error, setError] = useState("");
  const categories = Object.entries(CATEGORY_LABELS);

  async function handleStart(url: string, mode: AuditMode) {
    setError("");
    setProgress({
      phase: "initializing",
      current: 0,
      total: 0,
      remaining: 0,
      discovered: 0,
      percent: 0,
      url,
      message: "Connecting to audit engine...",
    });
    setAuditUrl(url);

    try {
      const report = await runStreamingAudit(url, mode, setProgress);
      await saveReport(report);
      router.push(`/audit/${report.id}`);
    } catch (err) {
      setAuditUrl(null);
      setProgress(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (auditUrl) {
    return <AuditProgress url={auditUrl} progress={progress} />;
  }

  return (
    <div className="space-y-16">
      <section className="text-center pt-8 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-4 py-1.5 text-xs text-muted mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Metaminds
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Technical SEO Audit
        </h1>
        <p className="text-lg text-muted max-w-2xl mx-auto mb-10">
          Enter any URL to run a comprehensive 55-point technical SEO and page speed audit.
          Get a detailed, developer-ready report with actionable fixes.
        </p>
        <div className="flex justify-center">
          <AuditForm onSubmit={handleStart} error={error} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-6 text-center">What We Check</h2>
        <div className="flex flex-wrap justify-center gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="w-full rounded-xl border border-card-border bg-card p-5 sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)] lg:max-w-sm"
            >
              <f.icon className="h-5 w-5 text-accent mb-3" />
              <h3 className="font-medium mb-1">{f.title}</h3>
              <p className="text-sm text-muted">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4 text-center">Audit Categories</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {categories.map(([key, label]) => {
            const count = FRAMEWORK_CHECKPOINTS.filter((c) => c.category === key).length;
            return (
              <div
                key={key}
                className="w-full rounded-lg border border-card-border bg-card/50 px-4 py-3 text-center sm:w-[calc(50%-0.375rem)] lg:w-[calc(25%-0.5625rem)] lg:max-w-xs"
              >
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted mt-0.5">{count} checks</p>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted mt-4">
          {FRAMEWORK_CHECKPOINTS.length} total checkpoints · Max score 290 points
        </p>
      </section>
    </div>
  );
}
