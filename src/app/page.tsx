"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuditForm } from "@/components/audit/AuditForm";
import { AuditProgress } from "@/components/audit/AuditProgress";
import { saveReportToSession } from "@/lib/audit/reportSession";
import { FRAMEWORK_CHECKPOINTS, CATEGORY_LABELS } from "@/data/framework";
import type { AuditReport } from "@/types/audit.types";
import { Search, FileText, BarChart3, Shield, Zap } from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Full Site Crawl",
    description: "Discovers pages via sitemap and internal links, then audits each one sequentially.",
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

export default function HomePage() {
  const router = useRouter();
  const [auditUrl, setAuditUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const categories = Object.entries(CATEGORY_LABELS);

  async function handleStart(url: string) {
    setError("");
    setAuditUrl(url);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run audit");

      const report = data as AuditReport;
      saveReportToSession(report);
      router.push(`/audit/${report.id}`);
    } catch (err) {
      setAuditUrl(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (auditUrl) {
    return <AuditProgress url={auditUrl} />;
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
