"use client";

import { useState } from "react";
import type { CategoryScore } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS } from "@/data/framework";
import { STATUS_COLORS, PRIORITY_COLORS } from "@/data/framework";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronRight } from "lucide-react";

export function ChecklistResults({ categories }: { categories: CategoryScore[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Audit Checklist</h2>
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
                {cat.checks.map((check) => {
                  const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === check.checkpointId);
                  return (
                    <div key={check.checkpointId} className="p-4 hover:bg-background/20">
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
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{cp?.name || `Check #${check.checkpointId}`}</p>
                          <p className="text-sm text-muted mt-0.5">{check.message}</p>
                          {check.recommendation && (
                            <p className="text-sm text-accent mt-2">
                              <span className="font-medium">Fix:</span> {check.recommendation}
                            </p>
                          )}
                          {check.evidence && check.evidence.length > 0 && (
                            <div className="mt-2 text-xs font-mono text-muted bg-background/50 rounded p-2 overflow-x-auto">
                              {check.evidence.map((e, i) => (
                                <div key={i} className="truncate">{e}</div>
                              ))}
                            </div>
                          )}
                          {check.affectedUrls && check.affectedUrls.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-muted mb-1">Affected URLs ({check.affectedUrls.length}):</p>
                              {check.affectedUrls.slice(0, 5).map((u) => (
                                <p key={u} className="text-xs font-mono text-muted truncate">{u}</p>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-mono tabular-nums">
                            {check.score}/{check.maxScore}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
