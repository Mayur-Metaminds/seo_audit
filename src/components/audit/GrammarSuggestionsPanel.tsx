"use client";

import { useState } from "react";
import type { AuditReport, GrammarPageSuggestions } from "@/types/audit.types";
import { SpellCheck, ChevronDown, ChevronRight, Lightbulb, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function GrammarSuggestionsPanel({ report }: { report: AuditReport }) {
  const pages = report.grammarSuggestions || [];
  const [openUrl, setOpenUrl] = useState<string | null>(pages[0]?.url || null);

  if (!pages.length && !report.grammarError) return null;

  const totalIssues = pages.reduce((sum, p) => sum + p.suggestions.length, 0);

  return (
    <section className="rounded-2xl border border-card-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-card-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
            <SpellCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Grammar & writing suggestions</h2>
            <p className="text-xs text-muted mt-0.5">
              Advisory only — does not affect your SEO score. Powered by LanguageTool.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 self-start">
          {totalIssues} tip{totalIssues === 1 ? "" : "s"} · not scored
        </span>
      </div>

      {report.grammarError && (
        <div className="px-5 py-3 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/20">
          Grammar service note: {report.grammarError}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-sky-400 shrink-0" />
          No grammar issues found in sampled page copy (or the checker returned no matches).
        </div>
      ) : (
        <div className="divide-y divide-card-border">
          {pages.map((page) => (
            <GrammarPageBlock
              key={page.url}
              page={page}
              open={openUrl === page.url}
              onToggle={() => setOpenUrl((u) => (u === page.url ? null : page.url))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GrammarPageBlock({
  page,
  open,
  onToggle,
}: {
  page: GrammarPageSuggestions;
  open: boolean;
  onToggle: () => void;
}) {
  const path = page.url.replace(/^https?:\/\/[^/]+/, "") || "/";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-background/40 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted shrink-0" />}
        <span className="font-mono text-xs text-accent truncate flex-1">{path}</span>
        <span className="text-[11px] text-muted shrink-0">{page.suggestions.length} suggestion(s)</span>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1 text-muted hover:text-accent"
          title="Open page"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </button>

      {open && (
        <ul className="px-5 pb-4 space-y-3">
          {page.suggestions.map((s, i) => (
            <li
              key={`${s.ruleId || "r"}-${i}`}
              className="rounded-xl border border-card-border bg-background/50 p-3.5 space-y-2"
            >
              <p className="text-sm font-medium text-foreground">{s.shortMessage || s.message}</p>
              {s.shortMessage && s.message !== s.shortMessage && (
                <p className="text-xs text-muted leading-relaxed">{s.message}</p>
              )}
              {s.context && (
                <p className="text-xs font-mono text-slate-300 bg-slate-950/70 border border-card-border rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                  …{s.context}…
                </p>
              )}
              {s.replacements.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted mr-1">Try:</span>
                  {s.replacements.map((r) => (
                    <span
                      key={r}
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-md border font-medium",
                        "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      )}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
              {(s.category || s.ruleId) && (
                <p className="text-[10px] font-mono text-muted">
                  {[s.category, s.ruleId].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
