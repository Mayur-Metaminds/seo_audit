"use client";

import { useState } from "react";
import { Globe, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface AuditFormProps {
  onSubmit: (url: string) => void;
  error?: string;
  disabled?: boolean;
}

export function AuditForm({ onSubmit, error, disabled }: AuditFormProps) {
  const [url, setUrl] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="rounded-2xl border border-card-border bg-card p-6 shadow-xl shadow-black/20">
        <label htmlFor="url" className="block text-sm font-medium text-muted mb-2">
          Website URL to audit
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              disabled={disabled}
              className="w-full rounded-xl border border-card-border bg-background pl-11 pr-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !url.trim()}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-medium transition-all",
              "bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            Run Audit
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    </form>
  );
}
