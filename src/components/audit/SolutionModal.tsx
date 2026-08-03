"use client";

import { useState, useEffect } from "react";
import type { CheckOccurrence, CheckResult } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS, PRIORITY_COLORS } from "@/data/framework";
import { getExplainer } from "@/data/checkpointExplainers";
import { cn } from "@/lib/utils/cn";
import { formatCodeSnippet } from "@/lib/utils/formatCodeSnippet";
import { buildPageCanonicalSolution } from "@/lib/utils/html";
import {
  X,
  MapPin,
  Lightbulb,
  Code2,
  Copy,
  Check,
  AlertOctagon,
  CheckCircle2,
  Globe,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Gauge,
  Search,
  BookOpen,
  WrapText,
} from "lucide-react";

interface SolutionModalProps {
  check?: CheckResult;
  checkpointId?: number;
  isOpen: boolean;
  onClose: () => void;
  pageUrl?: string;
}

function resolveOccurrence(check: CheckResult | undefined, urlIndex: number, pageUrl?: string): CheckOccurrence | null {
  const occurrences = check?.occurrences;
  if (occurrences && occurrences.length > 0) {
    return occurrences[Math.min(urlIndex, occurrences.length - 1)] || null;
  }

  const urls = check?.affectedUrls?.length ? check.affectedUrls : pageUrl ? [pageUrl] : [];
  const url = urls[urlIndex] || urls[0] || pageUrl || "";
  if (!url && !check) return null;

  return {
    url: url || "site-wide",
    status: check?.status || "fail",
    message: check?.message || "",
    evidence: check?.evidence,
    issueCode: check?.issueCode,
    solutionCode: check?.solutionCode,
    recommendation: check?.recommendation,
    suggestion: check?.suggestion,
    codeLocation: check?.codeLocation,
    whyItMatters: check?.whyItMatters,
    seoImpact: check?.seoImpact,
    howToVerify: check?.howToVerify,
    rankingEffect: check?.rankingEffect,
    confidence: check?.confidence,
    isGenuineSeoIssue: check?.isGenuineSeoIssue,
    measuredValue: check?.measuredValue,
    measuredUnit: check?.measuredUnit,
  };
}

const IMPACT_STYLES: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  medium: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  low: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  informational: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  measured: "Measured (Lighthouse / headless / CrUX)",
  high: "High confidence",
  medium: "Medium confidence",
  low: "Heuristic estimate — confirm with lab tools",
};

export function SolutionModal({ check, checkpointId, isOpen, onClose, pageUrl }: SolutionModalProps) {
  const [urlIndex, setUrlIndex] = useState(0);

  const id = check?.checkpointId || checkpointId;
  const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === id);
  const explainer = id ? getExplainer(id) : undefined;

  const urls =
    check?.occurrences && check.occurrences.length > 0
      ? check.occurrences.map((o) => o.url)
      : check?.affectedUrls && check.affectedUrls.length > 0
        ? check.affectedUrls
        : pageUrl
          ? [pageUrl]
          : [];

  useEffect(() => {
    setUrlIndex(0);
  }, [check, checkpointId]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const occurrence = resolveOccurrence(check, urlIndex, pageUrl);
  const activeUrl = occurrence?.url || urls[urlIndex] || pageUrl || "";
  const activeUrlPath =
    activeUrl && activeUrl !== "site-wide" ? activeUrl.replace(/^https?:\/\/[^/]+/, "") || "/" : "";

  const location =
    occurrence?.codeLocation || check?.codeLocation || cp?.codeLocation || "Source HTML / Component template";
  const suggestion =
    occurrence?.suggestion ||
    occurrence?.recommendation ||
    check?.suggestion ||
    cp?.suggestion ||
    check?.recommendation ||
    cp?.description;

  const whyItMatters = occurrence?.whyItMatters || check?.whyItMatters || explainer?.whyItMatters;
  const rankingEffect = occurrence?.rankingEffect || check?.rankingEffect || explainer?.rankingEffect;
  const howToVerify = occurrence?.howToVerify || check?.howToVerify || explainer?.howToVerify;
  const seoImpact = occurrence?.seoImpact || check?.seoImpact || explainer?.seoImpact || cp?.priority || "medium";
  const confidence = occurrence?.confidence || check?.confidence || "medium";
  const isGenuine =
    occurrence?.isGenuineSeoIssue ??
    check?.isGenuineSeoIssue ??
    (check?.status === "fail" || check?.status === "warn");

  const baseIssueCode =
    occurrence?.issueCode || check?.issueCode || cp?.issueCode || "<!-- Issue present: element missing or invalid -->";
  const baseSolutionCode = occurrence?.solutionCode || check?.solutionCode || cp?.solutionCode;

  // #4 Canonical: rebuild sample codes from the active URL, but never invent a
  // "missing" problem when this occurrence already passed or has a different message.
  const status = occurrence?.status || check?.status;
  const msg = (occurrence?.message || check?.message || "").toLowerCase();
  const isCanonicalMissingFinding =
    id === 4 && (msg.includes("missing canonical") || (status === "fail" && msg.includes("canonical")));
  const canonicalRebuild =
    id === 4 && activeUrl && activeUrl !== "site-wide" && (isCanonicalMissingFinding || status === "warn")
      ? buildPageCanonicalSolution(activeUrl)
      : null;
  // For missing: full rebuild. For warn (relative/wrong): only replace polluted solution snippets.
  const useCanonicalSolution =
    !!canonicalRebuild &&
    (isCanonicalMissingFinding ||
      !baseSolutionCode ||
      /preload|\/_next\/|webpack/i.test(baseSolutionCode || ""));
  const useCanonicalIssue =
    !!canonicalRebuild &&
    isCanonicalMissingFinding &&
    (!baseIssueCode || /preload|\/_next\/|webpack|<style/i.test(baseIssueCode));

  const issueCodeRaw = useCanonicalIssue && canonicalRebuild ? canonicalRebuild.issueCode : baseIssueCode;
  const solutionCodeRaw =
    useCanonicalSolution && canonicalRebuild ? canonicalRebuild.solutionCode : baseSolutionCode;

  const issueCode =
    urls.length > 1
      ? `<!-- Occurrence #${urlIndex + 1} on Page: ${activeUrlPath || activeUrl} -->\n${issueCodeRaw}`
      : issueCodeRaw;

  const solutionCode =
    solutionCodeRaw && urls.length > 1
      ? `<!-- Corrected Solution for Page #${urlIndex + 1}: ${activeUrlPath || activeUrl} -->\n${solutionCodeRaw}`
      : solutionCodeRaw;

  const detectedMessage = occurrence?.message || check?.message;
  const detectedEvidence = occurrence?.evidence || check?.evidence;
  const measured =
    occurrence?.measuredValue != null
      ? `${occurrence.measuredValue}${occurrence.measuredUnit === "cls" ? "" : occurrence.measuredUnit === "ms" ? "ms" : ` ${occurrence.measuredUnit || ""}`}`
      : check?.measuredValue != null
        ? `${check.measuredValue}${check.measuredUnit === "ms" ? "ms" : ""}`
        : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="solution-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[92vh] min-h-0 flex flex-col rounded-2xl border border-card-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border bg-background/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono font-bold text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-md shrink-0">
              #{id}
            </span>
            <div className="min-w-0">
              <h3 id="solution-modal-title" className="text-lg font-bold text-foreground tracking-tight truncate">
                {cp?.name || check?.message || `Issue #${id}`}
              </h3>
              {cp && (
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span
                    className={cn(
                      "text-[11px] px-2.5 py-0.5 rounded-full border capitalize font-semibold",
                      PRIORITY_COLORS[cp.priority]
                    )}
                  >
                    {cp.priority} Priority
                  </span>
                  <span className="text-xs text-muted capitalize font-medium">• {cp.category.replace("-", " ")}</span>
                  {measured && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-card-border bg-background/80 text-foreground">
                      Measured: {measured}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close solution"
            className="p-2 rounded-xl hover:bg-background/80 text-muted hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {urls.length > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-6 py-2.5 bg-accent/5 border-b border-card-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                Multiple Occurrences ({urls.length} pages affected):
              </span>
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
                Previous Page
              </button>
              <button
                type="button"
                disabled={urlIndex >= urls.length - 1}
                onClick={() => setUrlIndex((prev) => Math.min(prev + 1, urls.length - 1))}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                Next Page
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4 flex flex-col">
            {/* Verdict: genuine SEO impact */}
            <div
              className={cn(
                "rounded-xl border p-4 space-y-3",
                isGenuine ? "bg-danger/10 border-danger/30" : "bg-emerald-950/20 border-emerald-500/30"
              )}
            >
              <div className="flex items-start gap-3">
                {isGenuine ? (
                  <ShieldAlert className="h-5 w-5 text-danger shrink-0 mt-0.5" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-2 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">SEO Verdict</p>
                  <p className="text-sm font-semibold text-foreground">
                    {check?.status === "warn"
                      ? "Warning — recommended improvement (solution included)"
                      : isGenuine
                        ? "Genuine SEO issue — worth fixing"
                        : "Informational / heuristic — validate before large changes"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className={cn("text-[11px] px-2.5 py-0.5 rounded-full border capitalize font-semibold", IMPACT_STYLES[seoImpact] || IMPACT_STYLES.medium)}>
                      Impact: {seoImpact}
                    </span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-card-border bg-background/60 text-foreground font-medium">
                      {CONFIDENCE_LABEL[confidence] || confidence}
                    </span>
                  </div>
                  {rankingEffect && (
                    <p className="text-xs text-muted leading-relaxed">
                      <span className="font-semibold text-foreground">Ranking effect: </span>
                      {rankingEffect}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {whyItMatters && (
              <div className="rounded-xl border border-card-border bg-background/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
                  <BookOpen className="h-3.5 w-3.5" />
                  Why this matters
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed">{whyItMatters}</p>
                {explainer?.commonFalsePositives && (
                  <p className="text-[11px] text-muted leading-relaxed border-t border-card-border pt-2">
                    <span className="font-semibold text-foreground">Watch for false positives: </span>
                    {explainer.commonFalsePositives}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-card-border bg-background/60 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider">
                  <MapPin className="h-3.5 w-3.5" />
                  Where to look
                </div>
                <p className="text-xs font-mono font-semibold text-foreground bg-card p-2 rounded-lg border border-card-border truncate">
                  {location}
                </p>
              </div>

              <div className="rounded-xl border border-card-border bg-background/60 p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-accent uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    Active Page URL
                  </div>
                  {urls.length > 1 && (
                    <span className="text-[10px] font-mono text-muted">
                      #{urlIndex + 1}/{urls.length}
                    </span>
                  )}
                </div>
                {activeUrl && activeUrl !== "site-wide" ? (
                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between text-xs font-mono text-foreground hover:text-accent bg-card p-2 rounded-lg border border-card-border/80 transition-colors group truncate"
                  >
                    <span className="truncate">{activeUrlPath || activeUrl}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100 ml-1.5" />
                  </a>
                ) : (
                  <p className="text-xs font-mono text-muted bg-card p-2 rounded-lg border border-card-border">
                    Site-wide / Global
                  </p>
                )}
              </div>
            </div>

            {detectedMessage && (
              <div className="rounded-xl bg-danger/10 border border-danger/30 p-4 space-y-2">
                <p className="text-xs text-danger font-semibold uppercase tracking-wider">What we found</p>
                <p className="text-sm font-medium text-foreground leading-relaxed">{detectedMessage}</p>
                {detectedEvidence && detectedEvidence.length > 0 && (
                  <div className="mt-2 text-xs font-mono text-muted bg-slate-950/80 rounded p-2.5 overflow-x-auto space-y-1 border border-card-border">
                    {detectedEvidence.map((ev, i) => (
                      <div key={i} className="whitespace-pre-wrap break-all">
                        • {ev}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-danger/40 bg-slate-950 text-slate-100 overflow-hidden shadow-inner flex-1 flex flex-col min-h-[200px]">
              <div className="flex items-center justify-between px-4 py-2.5 bg-danger/20 border-b border-danger/30 text-xs font-semibold text-danger shrink-0">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-4 w-4 text-danger" />
                  <span>Problematic Code / Evidence</span>
                </div>
              </div>
              <DiffCodeBlock
                code={issueCode}
                type="issue"
                checkpointId={id}
                onCopy={(txt) => navigator.clipboard.writeText(txt)}
              />
            </div>
          </div>

          <div className="space-y-4 flex flex-col">
            {suggestion && (
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
                  <Lightbulb className="h-4 w-4" />
                  How to fix
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed font-medium">{suggestion}</p>
              </div>
            )}

            {howToVerify && (
              <div className="rounded-xl border border-card-border bg-background/60 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground uppercase tracking-wider">
                  <Search className="h-3.5 w-3.5 text-accent" />
                  How to verify (independently)
                </div>
                <p className="text-xs text-muted leading-relaxed">{howToVerify}</p>
              </div>
            )}

            {solutionCode && (
              <div className="rounded-xl border border-emerald-500/40 bg-slate-950 text-slate-100 overflow-hidden shadow-inner flex-1 flex flex-col min-h-[200px]">
                <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-950/40 border-b border-emerald-500/30 shrink-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Code2 className="h-4 w-4" />
                    Corrected pattern (adapt to your stack)
                  </div>
                </div>
                <DiffCodeBlock
                  code={solutionCode}
                  type="solution"
                  checkpointId={id}
                  onCopy={(txt) => navigator.clipboard.writeText(txt)}
                />
              </div>
            )}

            <div className="rounded-xl bg-emerald-950/20 border border-emerald-500/30 p-3.5 flex items-start gap-2.5 shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5" />
                  Verification checklist
                </p>
                <p>1. Open the affected URL and confirm the finding in DevTools / view-source.</p>
                <p>2. Apply the fix in the template/CMS for that page type (not only one URL if it is a pattern).</p>
                <p>3. Re-run this audit — measured checks (PSI/headless) should clear or improve.</p>
                {(id === 21 || (id && id >= 27 && id <= 33)) && (
                  <p>4. Cross-check with Google PageSpeed Insights and Search Console → Core Web Vitals.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-card-border bg-background/70 flex items-center justify-between shrink-0">
          <p className="text-xs text-muted font-mono">
            {urls.length > 1
              ? `Viewing Item ${urlIndex + 1} of ${urls.length}`
              : "Enterprise SEO finding · evidence-backed"}
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

/** Keywords that are actually the SEO fix — never framework/runtime noise. */
function solutionHighlightMatchers(checkpointId?: number): RegExp[] {
  switch (checkpointId) {
    case 4:
    case 23:
    case 24:
      return [/rel=["']canonical["']/i, /canonical:\s*['"]/i, /link rel=.canonical/i];
    case 7:
      return [/name=["']robots["']/i, /noindex/i, /index,\s*follow/i];
    case 9:
      return [/<title[\s>]/i];
    case 10:
      return [/name=["']description["']/i];
    case 11:
    case 12:
      return [/<h[1-6][\s>]/i];
    case 15:
      return [/\balt=/i, /<img\b/i];
    case 16:
      return [/application\/ld\+json/i, /"@type"/i, /schema\.org/i];
    case 20:
      return [/name=["']viewport["']/i];
    case 22:
      return [/<main[\s>]/i, /<h1[\s>]/i, /SSR|SSG|prerender/i];
    default:
      return [];
  }
}

function isMeaningfulSolutionLine(line: string, checkpointId?: number): boolean {
  const t = line.trim();
  if (!t) return false;
  // Never treat Next framework assets as "the fix"
  if (/\/_next\//i.test(t) || /webpack-/i.test(t)) return false;
  if (/rel=["'](?:preload|modulepreload|prefetch|stylesheet)["']/i.test(t)) return false;
  if (/as=["'](?:script|style)["']/i.test(t)) return false;
  // Comments that are only docs (keep metadata-related ones for context)
  if (t.startsWith("//") && !/canonical|metadata|title|description/i.test(t)) return false;

  if (t.startsWith("+")) return true;
  if (/<!--\s*Corrected/i.test(t) || /Exactly one H1/i.test(t)) return true;

  const matchers = solutionHighlightMatchers(checkpointId);
  if (matchers.some((re) => re.test(t))) return true;

  return false;
}

function isMeaningfulIssueLine(line: string, checkpointId?: number): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith("-")) return true;
  if (/PROBLEM:|Missing:|<!-- Issue|<!-- Missing|H1s on|Server response/i.test(t)) return true;
  if (checkpointId === 4 && /rel=["']canonical["']/i.test(t) && t.startsWith("-")) return true;
  if (/\/_next\//i.test(t) || /webpack-/i.test(t)) return false;
  return false;
}

function DiffCodeBlock({
  code,
  type,
  checkpointId,
  onCopy,
}: {
  code: string;
  type: "issue" | "solution";
  checkpointId?: number;
  onCopy: (copiedText: string) => void;
}) {
  const [copiedPill, setCopiedPill] = useState<string | null>(null);
  const [copiedFull, setCopiedFull] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const formattedCode = formatCodeSnippet(code);
  const lines = formattedCode.split("\n");

  const extractedClassNames = (() => {
    const matches = formattedCode.matchAll(/class(?:Name)?=["']([^"']+)["']/g);
    const set = new Set<string>();
    for (const m of matches) {
      if (m[1]) {
        m[1].split(/\s+/).forEach((cls) => {
          if (cls.length > 2 && !cls.includes("<") && !cls.includes(">")) set.add(cls);
        });
      }
    }
    return Array.from(set).slice(0, 6);
  })();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500 font-semibold">DevTools Class Search:</span>
          {extractedClassNames.length > 0 ? (
            extractedClassNames.map((cls) => (
              <button
                key={cls}
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(cls);
                  setCopiedPill(cls);
                  setTimeout(() => setCopiedPill(null), 2000);
                }}
                className={cn(
                  "px-2 py-0.5 rounded border transition-colors flex items-center gap-1 font-semibold",
                  copiedPill === cls
                    ? "bg-emerald-950 text-emerald-300 border-emerald-500"
                    : "bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700"
                )}
              >
                {copiedPill === cls ? <Check className="h-3 w-3 text-emerald-400" /> : null}
                <span>{cls}</span>
              </button>
            ))
          ) : (
            <span className="text-slate-500 italic">Use tags / metrics below</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setWordWrap((w) => !w)}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
            className={cn(
              "px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1",
              wordWrap
                ? "bg-accent/20 text-accent border border-accent/40"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-transparent"
            )}
          >
            <WrapText className="h-3 w-3" />
            <span>{wordWrap ? "Wrap on" : "Wrap off"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onCopy(formattedCode);
              setCopiedFull(true);
              setTimeout(() => setCopiedFull(false), 2000);
            }}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors flex items-center gap-1"
          >
            {copiedFull ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copiedFull ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>

      <div
        className={cn(
          "p-0 font-mono text-xs leading-relaxed flex-1 max-h-[min(40vh,22rem)] overflow-y-auto overscroll-contain bg-slate-950",
          wordWrap ? "overflow-x-hidden" : "overflow-x-auto"
        )}
      >
        <table className="w-full border-collapse table-fixed">
          <tbody>
            {lines.map((line, idx) => {
              const trimmed = line.trim();
              const isRemoved = type === "issue" && isMeaningfulIssueLine(line, checkpointId);
              const isAdded = type === "solution" && isMeaningfulSolutionLine(line, checkpointId);

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
                  <td className="w-9 select-none text-right pr-2 text-slate-600 text-[11px] border-r border-slate-800/80 bg-slate-950/80 py-1 font-mono align-top">
                    {idx + 1}
                  </td>
                  <td className="w-5 select-none text-center font-bold text-xs py-1 align-top">
                    {trimmed.startsWith("-") || isRemoved ? (
                      <span className="text-rose-400">-</span>
                    ) : trimmed.startsWith("+") || isAdded ? (
                      <span className="text-emerald-400">+</span>
                    ) : (
                      <span className="text-slate-700"> </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "py-1 px-3",
                      wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                    )}
                  >
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
