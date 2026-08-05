"use client";

import { useState } from "react";
import { Globe, ArrowRight, Code2, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type AuditMode = "sitemap" | "webflow";

interface AuditFormProps {
  onSubmit: (url: string, mode: AuditMode) => void;
  error?: string;
  disabled?: boolean;
}

export function AuditForm({ onSubmit, error, disabled }: AuditFormProps) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<AuditMode>("sitemap");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed, mode);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl text-left">
      <div className="rounded-2xl border border-card-border bg-card p-6 shadow-xl shadow-black/20">
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          Select Audit Mode
        </label>

        {/* Mode Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setMode("sitemap")}
            disabled={disabled}
            className={cn(
              "relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer",
              mode === "sitemap"
                ? "border-accent bg-accent/10 ring-1 ring-accent/40 shadow-sm"
                : "border-card-border bg-background/40 hover:bg-background/80 hover:border-muted/50"
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                  <Code2 className="h-4 w-4 text-accent" />
                  Fullstack & Next.js
                </div>
                {mode === "sitemap" && <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />}
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Strict XML sitemap discovery. Best for Next.js & Fullstack apps with sitemaps.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              Sitemap-Driven Audit
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode("webflow")}
            disabled={disabled}
            className={cn(
              "relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all cursor-pointer",
              mode === "webflow"
                ? "border-accent bg-accent/10 ring-1 ring-accent/40 shadow-sm"
                : "border-card-border bg-background/40 hover:bg-background/80 hover:border-muted/50"
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Webflow & General Web
                </div>
                {mode === "webflow" && <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />}
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Deep page link crawler. Best for Webflow, WordPress, Shopify & sites without sitemaps.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              Page-Link Crawler Audit
            </div>
          </button>
        </div>

        {/* URL Input */}
        <label htmlFor="url" className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          Website URL to audit
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                mode === "sitemap" ? "https://your-nextjs-app.com" : "https://your-webflow-site.com"
              }
              required
              disabled={disabled}
              className="w-full rounded-xl border border-card-border bg-background pl-11 pr-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !url.trim()}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-medium transition-all text-sm shrink-0",
              "bg-accent text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-accent/20"
            )}
          >
            Run Audit
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Helper Note */}
        <p className="mt-2.5 text-xs text-muted">
          {mode === "sitemap"
            ? "⚡ Discovers and checks all URLs listed in your website's sitemap.xml file."
            : "🔍 Discovers and checks all reachable pages by following internal links across your site."}
        </p>

        {url.toLowerCase().includes("webflow.io") && mode === "sitemap" && (
          <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <span>💡 Webflow staging sites (`.webflow.io`) do not publish an XML sitemap. Switch to <strong>Webflow & General Web</strong> mode to crawl all pages.</span>
            <button
              type="button"
              onClick={() => setMode("webflow")}
              className="shrink-0 rounded-lg bg-warning/20 px-3 py-1.5 font-semibold hover:bg-warning/30 transition-all cursor-pointer"
            >
              Switch to Webflow Mode
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger font-medium">{error}</p>}
      </div>
    </form>
  );
}
