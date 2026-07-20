"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Shield, Zap } from "lucide-react";

const PHASES = [
  { key: "crawling", label: "Crawling site pages...", icon: Search },
  { key: "security", label: "Running security checks...", icon: Shield },
  { key: "auditing", label: "Running SEO checks...", icon: Zap },
] as const;

interface AuditProgressProps {
  url: string;
}

export function AuditProgress({ url }: AuditProgressProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const phaseTimer = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % PHASES.length);
    }, 4000);

    const clock = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    return () => {
      clearInterval(phaseTimer);
      clearInterval(clock);
    };
  }, []);

  const phase = PHASES[phaseIndex];
  const Icon = phase.icon;
  const domain = (() => {
    try {
      return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    } catch {
      return url;
    }
  })();

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className="mx-auto max-w-lg text-center py-16">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 text-accent mb-6 animate-pulse-ring">
        <Icon className="h-6 w-6" />
      </div>

      <h2 className="text-xl font-semibold mb-2">Running SEO Audit</h2>
      <p className="text-muted text-sm font-mono mb-1">{url}</p>
      <p className="text-muted text-sm mb-8">{phase.label}</p>

      <div className="relative h-2 rounded-full bg-card-border overflow-hidden mb-3 progress-indeterminate" />

      <p className="text-sm text-muted flex items-center justify-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Keep this tab open · {timeLabel} elapsed
      </p>

      <div className="mt-12 grid grid-cols-3 gap-4 text-left">
        {[
          { label: "Checkpoints", value: "55" },
          { label: "Status", value: "In progress" },
          { label: "Domain", value: domain },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-card-border bg-card p-3">
            <p className="text-xs text-muted">{item.label}</p>
            <p className="text-sm font-medium truncate">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
