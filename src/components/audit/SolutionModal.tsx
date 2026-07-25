"use client";

import { useState, useEffect } from "react";
import type { CheckResult } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS, PRIORITY_COLORS } from "@/data/framework";
import { cn } from "@/lib/utils/cn";
import { X, MapPin, Lightbulb, Code2, Copy, Check, AlertOctagon, CheckCircle2, Globe, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface SolutionModalProps {
  check?: CheckResult;
  checkpointId?: number;
  isOpen: boolean;
  onClose: () => void;
  pageUrl?: string;
}

export function SolutionModal({ check, checkpointId, isOpen, onClose, pageUrl }: SolutionModalProps) {
  const [urlIndex, setUrlIndex] = useState(0);

  const id = check?.checkpointId || checkpointId;
  const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === id);

  const urls = (check?.affectedUrls && check.affectedUrls.length > 0)
    ? check.affectedUrls
    : (pageUrl ? [pageUrl] : []);

  // Reset active item index when check or checkpointId changes
  useEffect(() => {
    setUrlIndex(0);
  }, [check, checkpointId]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const activeUrl = urls[urlIndex] || pageUrl || "";
  const activeUrlPath = activeUrl ? activeUrl.replace(/^https?:\/\/[^/]+/, "") || "/" : "";

  const location = check?.codeLocation || cp?.codeLocation || "Source HTML / Component template";
  const suggestion = check?.suggestion || cp?.suggestion || check?.recommendation || cp?.description;

  const baseIssueCode = check?.issueCode || cp?.issueCode || "<!-- Issue present: element missing or invalid -->";
  const baseSolutionCode = check?.solutionCode || cp?.solutionCode;

  // Add specific page URL header comment if multiple occurrences exist
  const issueCode = urls.length > 1
    ? `<!-- Occurrence #${urlIndex + 1} on Page: ${activeUrlPath} -->\n${baseIssueCode}`
    : baseIssueCode;

  const solutionCode = baseSolutionCode && urls.length > 1
    ? `<!-- Corrected Solution for Page #${urlIndex + 1}: ${activeUrlPath} -->\n${baseSolutionCode}`
    : baseSolutionCode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-card-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border bg-background/70 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-md">
              #{id}
            </span>
            <div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                {cp?.name || check?.message || `Issue #${id}`}
              </h3>
              {cp && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-[11px] px-2.5 py-0.5 rounded-full border capitalize font-semibold", PRIORITY_COLORS[cp.priority])}>
                    {cp.priority} Priority
                  </span>
                  <span className="text-xs text-muted capitalize font-medium">• {cp.category.replace("-", " ")}</span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-background/80 text-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Multi-Item Stepper Bar */}
        {urls.length > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-6 py-2.5 bg-accent/5 border-b border-card-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Multiple Occurrences ({urls.length} pages affected):</span>
              <span className="text-xs font-mono font-bold text-accent bg-card px-2.5 py-0.5 rounded-md border border-card-border shadow-sm">
                Item {urlIndex + 1} of {urls.length}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={urlIndex === 0}
                onClick={() => setUrlIndex((prev) => Math.max(prev - 1, 0))}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-card-border bg-card text-foreground hover:bg-card-border/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous Page</span>
              </button>

              <button
                type="button"
                disabled={urlIndex >= urls.length - 1}
                onClick={() => setUrlIndex((prev) => Math.min(prev + 1, urls.length - 1))}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <span>Next Page</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Side-by-side 2 Column Body */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN: Problem / Issue Code */}
          <div className="space-y-4 flex flex-col">
            {/* Page URL & Code Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Location Badge */}
              <div className="rounded-xl border border-card-border bg-background/60 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Code Location</span>
                </div>
                <p className="text-xs font-mono font-semibold text-foreground bg-card p-2 rounded-lg border border-card-border truncate">
                  {location}
                </p>
              </div>

              {/* Page URL Badge */}
              <div className="rounded-xl border border-card-border bg-background/60 p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-accent uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Active Page URL</span>
                  </div>
                  {urls.length > 1 && (
                    <span className="text-[10px] font-mono text-muted">#{urlIndex + 1}/{urls.length}</span>
                  )}
                </div>

                {activeUrl ? (
                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between text-xs font-mono text-foreground hover:text-accent bg-card p-2 rounded-lg border border-card-border/80 transition-colors group truncate"
                  >
                    <span className="truncate">{activeUrlPath}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 ml-1.5" />
                  </a>
                ) : (
                  <p className="text-xs font-mono text-muted bg-card p-2 rounded-lg border border-card-border">Site-wide / Global</p>
                )}
              </div>
            </div>

            {/* Audit Finding */}
            {check?.message && (
              <div className="rounded-xl bg-danger/10 border border-danger/30 p-4 space-y-2">
                <p className="text-xs text-danger font-semibold uppercase tracking-wider">Detected Issue</p>
                <p className="text-sm font-medium text-foreground leading-relaxed">{check.message}</p>

                {check.evidence && check.evidence.length > 0 && (
                  <div className="mt-2 text-xs font-mono text-muted bg-slate-950/80 rounded p-2.5 overflow-x-auto space-y-1 border border-card-border">
                    {check.evidence.map((ev, i) => (
                      <div key={i} className="truncate">• {ev}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Problem Code Box (Diff Viewer) */}
            <div className="rounded-xl border border-danger/40 bg-slate-950 text-slate-100 overflow-hidden shadow-inner flex-1 flex flex-col min-h-[220px]">
              <div className="flex items-center justify-between px-4 py-2.5 bg-danger/20 border-b border-danger/30 text-xs font-semibold text-danger shrink-0">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4 text-danger" />
                  <span>Problematic Code Context (Item #{urlIndex + 1})</span>
                </div>
                {urls.length > 1 && (
                  <span className="text-[10px] font-mono text-muted">Page {urlIndex + 1} of {urls.length}</span>
                )}
              </div>
              
              <DiffCodeBlock
                code={issueCode}
                type="issue"
                onCopy={(txt) => navigator.clipboard.writeText(txt)}
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Solution & Corrected Code */}
          <div className="space-y-4 flex flex-col">
            {/* Actionable Suggestion */}
            {suggestion && (
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
                  <Lightbulb className="h-4 w-4" />
                  <span>Fix Suggestion</span>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed font-medium">{suggestion}</p>
              </div>
            )}

            {/* Solution Code Box (Diff Viewer) */}
            {solutionCode && (
              <div className="rounded-xl border border-emerald-500/40 bg-slate-950 text-slate-100 overflow-hidden shadow-inner flex-1 flex flex-col min-h-[220px]">
                <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-950/40 border-b border-emerald-500/30 shrink-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Code2 className="h-4 w-4" />
                    <span>Corrected Solution Code Context (Item #{urlIndex + 1})</span>
                  </div>
                </div>

                <DiffCodeBlock
                  code={solutionCode}
                  type="solution"
                  onCopy={(txt) => navigator.clipboard.writeText(txt)}
                />
              </div>
            )}

            {/* Verification Steps */}
            <div className="rounded-xl bg-emerald-950/20 border border-emerald-500/30 p-3.5 flex items-start gap-2.5 shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-emerald-400">Verification Steps:</p>
                <p>1. Search for <span className="font-mono text-amber-300">{location}</span> in your IDE.</p>
                <p>2. Copy the corrected code snippet above and replace the issue line.</p>
                <p>3. Save file & re-run audit to confirm it passes!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-card-border bg-background/70 flex items-center justify-between shrink-0">
          <p className="text-xs text-muted font-mono">
            {urls.length > 1 ? `Viewing Item ${urlIndex + 1} of ${urls.length}` : "SEO Audit Code Fix & Solution Viewer"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors shadow"
          >
            Close Solution
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffCodeBlock({
  code,
  type,
  onCopy,
}: {
  code: string;
  type: "issue" | "solution";
  onCopy: (copiedText: string) => void;
}) {
  const [copiedPill, setCopiedPill] = useState<string | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);

  const lines = code.split("\n");

  // Extract all unique class names for quick IDE search
  const extractedClassNames = (() => {
    const matches = code.matchAll(/class(?:Name)?=["']([^"']+)["']/g);
    const set = new Set<string>();
    for (const m of matches) {
      if (m[1]) {
        m[1].split(/\s+/).forEach((cls) => {
          if (cls.length > 2 && !cls.includes("<") && !cls.includes(">")) {
            set.add(cls);
          }
        });
      }
    }
    return Array.from(set).slice(0, 6);
  })();

  const handleCopyPill = (clsName: string) => {
    navigator.clipboard.writeText(clsName);
    setCopiedPill(clsName);
    setTimeout(() => setCopiedPill(null), 2000);
  };

  const handleCopyFull = () => {
    onCopy(code);
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      {/* Chrome DevTools Search Helper Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500 font-semibold">DevTools Class Search:</span>
          {extractedClassNames.length > 0 ? (
            extractedClassNames.map((cls) => (
              <button
                key={cls}
                type="button"
                onClick={() => handleCopyPill(cls)}
                className={cn(
                  "px-2 py-0.5 rounded border transition-colors flex items-center gap-1 font-semibold",
                  copiedPill === cls
                    ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                    : "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700 hover:text-amber-200"
                )}
                title="Click to copy class name for Ctrl+Shift+F IDE search"
              >
                {copiedPill === cls ? <Check className="h-3 w-3 text-emerald-400" /> : null}
                <span>{cls}</span>
              </button>
            ))
          ) : (
            <span className="text-slate-500 italic">Use code tags below</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopyFull}
          className="self-end sm:self-auto px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors flex items-center gap-1 shrink-0"
        >
          {copiedFull ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          <span>{copiedFull ? "Copied Code!" : "Copy Code"}</span>
        </button>
      </div>

      {/* Code Table with Line Numbers (Chrome DevTools Inspector Style) */}
      <div className="p-0 font-mono text-xs leading-relaxed overflow-x-auto flex-1 bg-slate-950">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => {
              const trimmed = line.trim();
              const isRemoved = type === "issue" && (trimmed.startsWith("-") || line.includes("<!-- Issue") || line.includes("<!-- Missing") || line.includes("<!-- Broken"));
              const isAdded = type === "solution" && (trimmed.startsWith("+") || line.includes("<!-- Corrected") || line.includes("<!-- Solution") || line.includes("<!-- Fixed"));

              return (
                <tr
                  key={idx}
                  className={cn(
                    "transition-colors",
                    isRemoved
                      ? "bg-rose-950/40 text-rose-300 font-semibold border-l-2 border-rose-500"
                      : isAdded
                      ? "bg-emerald-950/40 text-emerald-300 font-semibold border-l-2 border-emerald-500"
                      : "hover:bg-slate-900/60 text-slate-300 border-l-2 border-transparent"
                  )}
                >
                  <td className="w-9 select-none text-right pr-2 text-slate-600 text-[11px] border-r border-slate-800/80 bg-slate-950/80 py-1 font-mono">
                    {idx + 1}
                  </td>

                  <td className="w-5 select-none text-center font-bold text-xs py-1">
                    {trimmed.startsWith("-") ? (
                      <span className="text-rose-400">-</span>
                    ) : trimmed.startsWith("+") ? (
                      <span className="text-emerald-400">+</span>
                    ) : isRemoved ? (
                      <span className="text-rose-400">-</span>
                    ) : isAdded ? (
                      <span className="text-emerald-400">+</span>
                    ) : (
                      <span className="text-slate-700"> </span>
                    )}
                  </td>

                  <td className="py-1 px-3 whitespace-pre">
                    {line.replace(/^[+-]\s?/, "")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
