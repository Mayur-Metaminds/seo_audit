"use client";

import { useState } from "react";
import type { PageAuditResult } from "@/types/audit.types";
import { formatBytes, formatMs } from "@/lib/utils/url";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

export function PageReportTable({ pages }: { pages: PageAuditResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "issues">("all");

  const filtered = filter === "issues" ? pages.filter((p) => p.issues.length > 0) : pages;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Per-Page Results</h2>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1 rounded-lg transition-colors",
              filter === "all" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            )}
          >
            All ({pages.length})
          </button>
          <button
            onClick={() => setFilter("issues")}
            className={cn(
              "px-3 py-1 rounded-lg transition-colors",
              filter === "issues" ? "bg-danger text-white" : "text-muted hover:text-foreground"
            )}
          >
            With Issues ({pages.filter((p) => p.issues.length > 0).length})
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-card-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-muted">
                <th className="p-3 font-medium w-8"></th>
                <th className="p-3 font-medium">URL</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">TTFB</th>
                <th className="p-3 font-medium">Size</th>
                <th className="p-3 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {filtered.map((page) => (
                <PageRow
                  key={page.url}
                  page={page}
                  expanded={expanded === page.url}
                  onToggle={() => setExpanded(expanded === page.url ? null : page.url)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PageRow({
  page,
  expanded,
  onToggle,
}: {
  page: PageAuditResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-background/30 cursor-pointer" onClick={onToggle}>
        <td className="p-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted" />
          )}
        </td>
        <td className="p-3 max-w-xs">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs truncate block hover:text-accent"
            onClick={(e) => e.stopPropagation()}
          >
            {page.url.replace(/^https?:\/\/[^/]+/, "")}
            <ExternalLink className="inline h-3 w-3 ml-1 opacity-50" />
          </a>
        </td>
        <td className="p-3">
          <span
            className={cn(
              "text-xs font-mono px-2 py-0.5 rounded",
              page.statusCode === 200 ? "text-success" : "text-danger"
            )}
          >
            {page.statusCode}
          </span>
        </td>
        <td className="p-3 font-mono text-xs">{formatMs(page.responseTimeMs)}</td>
        <td className="p-3 font-mono text-xs">{formatBytes(page.pageSizeBytes)}</td>
        <td className="p-3">
          {page.issues.length > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-danger/10 text-danger">
              {page.issues.length}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">
              Clean
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="p-4 bg-background/30">
            {page.issues.length > 0 ? (
              <ul className="space-y-1">
                {page.issues.map((issue, i) => (
                  <li key={i} className="text-sm text-muted font-mono">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-success">No issues found on this page.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
