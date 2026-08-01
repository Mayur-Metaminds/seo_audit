"use client";

import { useState } from "react";
import type { CategoryScore, CheckResult } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS, STATUS_COLORS, PRIORITY_COLORS } from "@/data/framework";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronRight, Code2, Copy, Check, MapPin, Lightbulb } from "lucide-react";
import { SolutionModal } from "./SolutionModal";
import { formatCodeSnippet } from "@/lib/utils/formatCodeSnippet";

function CheckItemRow({ check, onOpenModal }: { check: CheckResult; onOpenModal: (c: CheckResult) => void }) {
  const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === check.checkpointId);
  const [copied, setCopied] = useState(false);
  const [showSolution, setShowSolution] = useState(check.status === "fail" || check.status === "warn");

  const location = check.codeLocation || cp?.codeLocation;
  const suggestion = check.suggestion || cp?.suggestion || check.recommendation;
  const firstOcc = check.occurrences?.[0];
  const solutionCode = formatCodeSnippet(
    firstOcc?.solutionCode || check.solutionCode || cp?.solutionCode || ""
  ) || undefined;
  const displaySolution = solutionCode?.trim() ? solutionCode : undefined;

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id={`checkpoint-${check.checkpointId}`} className="p-4 hover:bg-background/20 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-muted">#{check.checkpointId}</span>
          <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize", STATUS_COLORS[check.status])}>
            {check.status === "na" ? "not evaluated" : check.status}
          </span>
          {cp && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full border capitalize hidden sm:inline", PRIORITY_COLORS[cp.priority])}>
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

          {/* Location Badge */}
          {location && (
            <div className="flex items-center gap-1.5 text-xs text-muted font-mono bg-background/60 border border-card-border px-2.5 py-1 rounded-md w-fit">
              <MapPin className="h-3.5 w-3.5 text-accent shrink-0" />
              <span>Location in Code: <strong className="text-foreground font-semibold">{location}</strong></span>
            </div>
          )}

          {/* Suggestion */}
          {suggestion && (
            <div className="flex items-start gap-2 text-sm text-foreground bg-accent/5 border border-accent/20 p-2.5 rounded-lg">
              <Lightbulb className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-accent">Suggestion: </span>
                <span>{suggestion}</span>
              </div>
            </div>
          )}

          {/* Evidence */}
          {check.evidence && check.evidence.length > 0 && (
            <div className="text-xs font-mono text-muted bg-background/60 rounded p-2 overflow-x-auto border border-card-border">
              <p className="text-[10px] text-muted uppercase font-sans tracking-wider mb-1 font-semibold">Evidence / Details</p>
              {check.evidence.map((e, i) => (
                <div key={i} className="truncate">{e}</div>
              ))}
            </div>
          )}

          {/* Affected URLs */}
          {check.affectedUrls && check.affectedUrls.length > 0 && (
            <div className="text-xs text-muted">
              <p className="mb-1 font-medium">Affected URLs ({check.affectedUrls.length}):</p>
              <div className="space-y-0.5">
                {check.affectedUrls.slice(0, 5).map((u) => (
                  <p key={u} className="font-mono text-xs text-muted truncate">{u}</p>
                ))}
              </div>
            </div>
          )}

          {/* Code Solution Action Box */}
          {displaySolution && (
            <div className="mt-3 rounded-lg border border-card-border bg-slate-950 text-slate-100 overflow-hidden text-xs">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSolution(!showSolution)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <Code2 className="h-3.5 w-3.5 text-accent" />
                  <span>Developer Solution & Code Fix</span>
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
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {showSolution && (
                <div className="p-3 font-mono text-[11.5px] leading-relaxed overflow-x-auto bg-slate-950 text-slate-200">
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

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold mb-4">Audit Checklist & Developer Solutions</h2>
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat.category} className="rounded-xl border border-card-border bg-card overflow-hidden">
              <button
                onClick={() => toggle(cat.category)}
                className="w-full flex items-center justify-between p-4 hover:bg-background/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {expanded[cat.category] ? (
                    <ChevronDown className="h-4 w-4 text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  )}
                  <span className="font-medium">{cat.label}</span>
                  <span className="text-xs text-muted">({cat.checks.length} checks)</span>
                </div>
                <span className="text-sm font-bold tabular-nums">{cat.percentage}%</span>
              </button>

              {expanded[cat.category] && (
                <div className="border-t border-card-border divide-y divide-card-border">
                  {cat.checks.map((check) => (
                    <CheckItemRow key={check.checkpointId} check={check} onOpenModal={setSelectedCheck} />
                  ))}
                </div>
              )}
            </div>
          ))}
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
