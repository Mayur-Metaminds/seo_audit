"use client";

import { useState } from "react";
import type { AuditReport } from "@/types/audit.types";
import { Copy, Check } from "lucide-react";

export function RemainingPagesList({ report }: { report: AuditReport }) {
  const remaining = report.remainingUrls || [];
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (remaining.length === 0) return null;

  const visible = showAll ? remaining : remaining.slice(0, 50);

  async function copyAll() {
    await navigator.clipboard.writeText(remaining.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-xl border border-warning/30 bg-warning/5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-warning">Remaining Pages</h2>
          <p className="text-sm text-muted mt-1">
            {remaining.length} URL{remaining.length === 1 ? "" : "s"} discovered but not crawled/audited yet.
            {report.pagesAudited > 0 && (
              <> Audited {report.pagesAudited} of {report.totalPagesFound} found.</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-2 rounded-lg border border-card-border bg-card px-3 py-2 text-sm hover:bg-card-border/30 transition-colors"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy all URLs"}
        </button>
      </div>

      <ul className="max-h-80 overflow-y-auto space-y-1 rounded-lg border border-card-border bg-card/50 p-3">
        {visible.map((u) => (
          <li key={u}>
            <a
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-muted hover:text-accent break-all"
            >
              {u}
            </a>
          </li>
        ))}
      </ul>

      {remaining.length > 50 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm text-accent hover:underline"
        >
          {showAll ? "Show less" : `Show all ${remaining.length} URLs`}
        </button>
      )}
    </section>
  );
}
