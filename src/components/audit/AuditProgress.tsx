import type { AuditReport } from "@/types/audit.types";
import { Loader2, Search, Shield, Zap } from "lucide-react";

const phaseIcons: Record<string, React.ReactNode> = {
  initializing: <Loader2 className="h-5 w-5 animate-spin" />,
  crawling: <Search className="h-5 w-5" />,
  security: <Shield className="h-5 w-5" />,
  auditing: <Zap className="h-5 w-5" />,
};

export function AuditProgress({ report }: { report: AuditReport }) {
  const progress = report.progress;
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-lg text-center py-16">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 text-accent mb-6 animate-pulse-ring">
        {phaseIcons[progress.phase] || <Loader2 className="h-6 w-6 animate-spin" />}
      </div>

      <h2 className="text-xl font-semibold mb-2">Running SEO Audit</h2>
      <p className="text-muted text-sm font-mono mb-1">{report.url}</p>
      <p className="text-muted text-sm mb-8">{progress.message}</p>

      <div className="relative h-2 rounded-full bg-card-border overflow-hidden mb-3">
        <div
          className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 5)}%` }}
        />
      </div>

      <p className="text-sm text-muted">
        {progress.phase === "crawling" && `Crawling pages: ${progress.current} / ${progress.total}`}
        {progress.phase === "auditing" && `Auditing pages: ${progress.current} / ${progress.total}`}
        {progress.phase === "security" && "Running security checks..."}
        {progress.phase === "initializing" && "Initializing audit engine..."}
      </p>

      <div className="mt-12 grid grid-cols-3 gap-4 text-left">
        {[
          { label: "Checkpoints", value: "55" },
          { label: "Pages Found", value: String(report.totalPagesFound || report.pagesAudited || "...") },
          { label: "Domain", value: report.domain },
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
