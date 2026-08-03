"use client";

import { useEffect, useState } from "react";
import type { CategoryScore, CheckResult } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS, STATUS_COLORS, PRIORITY_COLORS } from "@/data/framework";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronRight, Code2, Copy, Check, MapPin, Lightbulb } from "lucide-react";
import { SolutionModal } from "./SolutionModal";
import { formatCodeSnippet } from "@/lib/utils/formatCodeSnippet";

function statusLabel(status: string): string {
  if (status === "fail") return "Issue";
  if (status === "warn") return "Warning";
  if (status === "pass") return "Pass";
  if (status === "na") return "N/A";
  if (status === "manual") return "Manual";
  return status;
}

function CheckItemRow({ check, onOpenModal }: { check: CheckResult; onOpenModal: (c: CheckResult) => void }) {
  const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === check.checkpointId);
  const [copied, setCopied] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const location = check.codeLocation || cp?.codeLocation;
  const suggestion = check.suggestion || cp?.suggestion || check.recommendation;
  const firstOcc = check.occurrences?.[0];
  const solutionCode =
    formatCodeSnippet(firstOcc?.solutionCode || check.solutionCode || cp?.solutionCode || "") || undefined;
  const displaySolution = solutionCode?.trim() ? solutionCode : undefined;

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id={`checkpoint-${check.checkpointId}`}
      className="p-4 hover:bg-background/20 transition-colors scroll-mt-24"
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-muted">#{check.checkpointId}</span>
          <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize", STATUS_COLORS[check.status])}>
            {statusLabel(check.status)}
          </span>
          {cp && (
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border capitalize hidden sm:inline",
                PRIORITY_COLORS[cp.priority]
              )}
            >
              {cp.priority}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{cp?.name || `Check #${check.checkpointId}`}</p>
            <button
              type="button"
              onClick={() => onOpenModal(check)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/10 hover:bg-accent text-accent hover:text-white text-xs font-medium transition-colors"
            >
              <Code2 className="h-3.5 w-3.5" />
              View Solution
            </button>
          </div>

          <p className="text-sm text-muted">{check.message}</p>

          {location && (
            <div className="flex items-center gap-1.5 text-xs text-muted font-mono bg-background/60 border border-card-border px-2.5 py-1 rounded-md w-fit">
              <MapPin className="h-3.5 w-3.5 text-accent shrink-0" />
              <span>
                Location: <strong className="text-foreground font-semibold">{location}</strong>
              </span>
            </div>
          )}

          {suggestion && (
            <div className="flex items-start gap-2 text-sm text-foreground bg-accent/5 border border-accent/20 p-2.5 rounded-lg">
              <Lightbulb className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-accent">Suggestion: </span>
                <span>{suggestion}</span>
              </div>
            </div>
          )}

          {check.evidence && check.evidence.length > 0 && (
            <div className="text-xs font-mono text-muted bg-background/60 rounded p-2 max-h-32 overflow-y-auto border border-card-border">
              <p className="text-[10px] text-muted uppercase font-sans tracking-wider mb-1 font-semibold">
                Evidence
              </p>
              {check.evidence.map((e, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {e}
                </div>
              ))}
            </div>
          )}

          {check.affectedUrls && check.affectedUrls.length > 0 && (
            <div className="text-xs text-muted">
              <p className="mb-1 font-medium">Affected URLs ({check.affectedUrls.length}):</p>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {check.affectedUrls.slice(0, 8).map((u) => (
                  <p key={u} className="font-mono text-xs text-muted truncate">
                    {u}
                  </p>
                ))}
              </div>
            </div>
          )}

          {displaySolution && (
            <div className="mt-3 rounded-lg border border-card-border bg-slate-950 text-slate-100 overflow-hidden text-xs">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
                <button
                  type="button"
                  aria-expanded={showSolution}
                  onClick={() => setShowSolution(!showSolution)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <Code2 className="h-3.5 w-3.5 text-accent" />
                  <span>Developer Solution</span>
                  {showSolution ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>

                {showSolution && (
                  <button
                    type="button"
                    onClick={() => handleCopy(displaySolution)}
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {showSolution && (
                <div className="p-3 font-mono text-[11.5px] leading-relaxed max-h-64 overflow-y-auto overflow-x-auto bg-slate-950 text-slate-200">
                  <pre className="whitespace-pre-wrap break-words">{displaySolution}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-right shrink-0 sm:pt-0.5">
          <span className="text-sm font-mono tabular-nums font-semibold">
            {check.score}/{check.maxScore}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ChecklistResults({ categories }: { categories: CategoryScore[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedCheck, setSelectedCheck] = useState<CheckResult | null>(null);

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Expand category + scroll when ScoreOverview (or others) request a checkpoint
  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<{ checkpointId: number }>).detail;
      const checkpointId = detail?.checkpointId;
      if (!checkpointId) return;

      const cat = categories.find((c) => c.checks.some((ch) => ch.checkpointId === checkpointId));
      if (cat) {
        setExpanded((prev) => ({ ...prev, [cat.category]: true }));
      }

      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.getElementById(`checkpoint-${checkpointId}`);
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-accent");
          setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 2500);
        }, 50);
      });
    };

    window.addEventListener("seo-jump-checkpoint", onJump as EventListener);
    return () => window.removeEventListener("seo-jump-checkpoint", onJump as EventListener);
  }, [categories]);

  return (
    <>
      <section id="audit-checklist">
        <h2 className="text-lg font-semibold mb-4">Audit Checklist & Developer Solutions</h2>
        <div className="space-y-4">
          {categories.map((cat) => {
            const isOpen = !!expanded[cat.category];
            const issueCount = cat.checks.filter((c) => c.status === "fail" || c.status === "warn").length;
            return (
              <div key={cat.category} className="rounded-xl border border-card-border bg-card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(cat.category)}
                  className="w-full flex items-center justify-between p-4 hover:bg-background/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted" />
                    )}
                    <span className="font-medium">{cat.label}</span>
                    <span className="text-xs text-muted">
                      ({cat.checks.length} checks
                      {issueCount > 0 ? ` · ${issueCount} open` : ""})
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{cat.percentage}%</span>
                </button>

                {isOpen && (
                  <div className="border-t border-card-border divide-y divide-card-border">
                    {cat.checks.map((check) => (
                      <CheckItemRow key={check.checkpointId} check={check} onOpenModal={setSelectedCheck} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <SolutionModal
        check={selectedCheck || undefined}
        isOpen={!!selectedCheck}
        onClose={() => setSelectedCheck(null)}
      />
    </>
  );
}
