"use client";

import { useEffect, useState } from "react";
import type { AuditProgressEvent } from "@/types/progress.types";
import { Loader2, Search, Shield, Zap, FileCheck2, MonitorPlay, Gauge, SpellCheck } from "lucide-react";

const PHASE_META: Record<string, { label: string; icon: typeof Search }> = {
  initializing: { label: "Initializing", icon: Loader2 },
  crawling: { label: "Crawling pages", icon: Search },
  security: { label: "Security checks", icon: Shield },
  rendering: { label: "Headless render (SEO DOM)", icon: MonitorPlay },
  pagespeed: { label: "Google PageSpeed / Lighthouse", icon: Gauge },
  auditing: { label: "Auditing pages", icon: Zap },
  grammar: { label: "Grammar tips (not scored)", icon: SpellCheck },
  finalizing: { label: "Building report", icon: FileCheck2 },
  complete: { label: "Complete", icon: FileCheck2 },
  failed: { label: "Failed", icon: Shield },
};

interface AuditProgressProps {
  url: string;
  progress: AuditProgressEvent | null;
}

export function AuditProgress({ url, progress }: AuditProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(clock);
  }, []);

  const phase = progress?.phase || "initializing";
  const meta = PHASE_META[phase] || PHASE_META.initializing;
  const Icon = meta.icon;
  const percent = progress?.percent ?? 0;
  const current = progress?.current ?? 0;
  const discovered = progress?.discovered ?? progress?.total ?? 0;
  const remaining = progress?.remaining ?? Math.max(0, discovered - current);
  const currentUrl = progress?.url || url;
  const message = progress?.message || "Starting audit...";

  const domain = (() => {
    try {
      return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    } catch {
      return url;
    }
  })();

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeLabel = minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 text-center">
      <div className="flex flex-col items-center">
        <div className="mb-6 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent animate-pulse-ring">
          <Icon className={`h-6 w-6 shrink-0 ${phase === "initializing" ? "animate-spin" : ""}`} />
        </div>

        <h2 className="h-7 text-xl font-semibold leading-7">Running SEO Audit</h2>
        <p className="mt-1 h-5 text-sm leading-5 text-muted">{meta.label}</p>
        <p className="mt-1 mb-6 h-5 w-full max-w-lg truncate text-sm leading-5 text-muted" title={message}>
          {message}
        </p>
      </div>

      <div className="mb-6 h-[4.75rem] rounded-xl border border-card-border bg-card px-4 py-3 text-left">
        <p className="h-4 text-xs leading-4 text-muted">Currently scanning</p>
        <p className="mt-1.5 h-10 overflow-hidden font-mono text-sm leading-5 text-accent" title={currentUrl}>
          <span className="line-clamp-2 break-all">{currentUrl}</span>
        </p>
      </div>

      <div className="mb-2 flex h-5 items-center justify-between text-sm leading-5">
        <span className="min-w-0 truncate text-muted tabular-nums">
          {discovered > 0
            ? `${current} done · ${remaining} remaining · ${discovered} found`
            : "Discovering pages..."}
        </span>
        <span className="shrink-0 pl-3 font-semibold tabular-nums">{percent}%</span>
      </div>

      <div className="relative mb-3 h-3 overflow-hidden rounded-full bg-card-border">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <p className="mb-10 flex h-5 items-center justify-center gap-2 text-sm leading-5 text-muted">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="tabular-nums">Keep this tab open · {timeLabel} elapsed</span>
      </p>

      <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
        {[
          { label: "Found", value: discovered > 0 ? String(discovered) : "…" },
          { label: "Done", value: current > 0 ? String(current) : "…" },
          { label: "Remaining", value: discovered > 0 ? String(remaining) : "…" },
          { label: "Domain", value: domain },
        ].map((item) => (
          <div key={item.label} className="h-[3.75rem] rounded-lg border border-card-border bg-card px-3 py-2.5">
            <p className="h-4 text-xs leading-4 text-muted">{item.label}</p>
            <p className="mt-1 h-5 truncate text-sm font-medium leading-5" title={item.value}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
