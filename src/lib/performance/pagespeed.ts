/**
 * Google PageSpeed Insights API (Lighthouse lab + CrUX field data).
 * https://developers.google.com/speed/docs/insights/v5/get-started
 */

import { isIP } from "node:net";
import { readPositiveInt, SlidingWindowRateLimiter } from "@/lib/utils/asyncPool";

export type PsiStrategy = "mobile" | "desktop";

export type PsiErrorKind =
  | "none"
  | "no_key"
  | "private_url"
  | "invalid_url"
  | "unreachable"
  | "rate_limit"
  | "auth"
  | "http"
  | "network";

export interface CruxMetric {
  percentile?: number;
  category?: "FAST" | "AVERAGE" | "SLOW";
}

export interface LabMetrics {
  source: "pagespeed-insights";
  strategy: PsiStrategy;
  fetchError?: string;
  errorKind?: PsiErrorKind;
  performanceScore: number | null;
  /** Lab metrics in ms (CLS unitless). */
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  speedIndexMs: number | null;
  ttfbMs: number | null;
  /** Lab INP is often unavailable; prefer field. */
  inpMs: number | null;
  /** CrUX field data when the URL/origin has enough traffic. */
  field: {
    lcpMs: number | null;
    cls: number | null;
    inpMs: number | null;
    fcpMs: number | null;
    ttfbMs: number | null;
  };
  lcpElement?: string;
  opportunities: { id: string; title: string; savingsMs?: number }[];
  diagnostics: string[];
  lighthouseVersion?: string;
  fetchedAt: string;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function metricMs(audits: Record<string, { numericValue?: number } | undefined>, id: string): number | null {
  const v = audits[id]?.numericValue;
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

function fieldPercentile(loadingExperience: unknown, metricId: string): number | null {
  const le = loadingExperience as {
    metrics?: Record<string, { percentiles?: { p75?: number } }>;
  } | null;
  const p75 = le?.metrics?.[metricId]?.percentiles?.p75;
  return typeof p75 === "number" && Number.isFinite(p75) ? Math.round(p75) : null;
}

function fieldCls(loadingExperience: unknown): number | null {
  const le = loadingExperience as {
    metrics?: Record<string, { percentiles?: { p75?: number } }>;
  } | null;
  const p75 = le?.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentiles?.p75;
  return typeof p75 === "number" && Number.isFinite(p75) ? p75 : null;
}

export function getPsiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_PSI_API_KEY?.trim() ||
    process.env.PAGESPEED_API_KEY?.trim() ||
    process.env.PSI_API_KEY?.trim() ||
    undefined
  );
}

const DEFAULT_PSI_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** Base PageSpeed Insights endpoint from env (no query string). */
export function getPsiApiUrl(): string {
  return (
    process.env.GOOGLE_PSI_API_URL?.trim() ||
    process.env.PAGESPEED_API_URL?.trim() ||
    process.env.PSI_API_URL?.trim() ||
    DEFAULT_PSI_API_URL
  );
}

export function getPsiMaxUrls(): number {
  // Up to one full rate-limit window of samples (300 / 100s), configurable
  return readPositiveInt(process.env.PSI_MAX_URLS, 30, PSI_RATE_LIMIT_PER_WINDOW);
}

/**
 * In-flight parallel PSI calls.
 * Hard-capped at Google window limit (300 / 100s) — default fills the pipe safely.
 */
export function getPsiConcurrency(): number {
  return readPositiveInt(process.env.PSI_CONCURRENCY, 30, PSI_RATE_LIMIT_PER_WINDOW);
}

/** Google PSI practical ceiling used by this app: 300 requests / 100 seconds. */
export const PSI_RATE_LIMIT_PER_WINDOW = 300;
export const PSI_RATE_WINDOW_MS = 100_000;

/** Fallback sample size / concurrency after Google rate-limits us. */
export const PSI_RATE_LIMIT_FALLBACK_MAX_URLS = 5;
export const PSI_RATE_LIMIT_FALLBACK_CONCURRENCY = 2;

let psiRateLimiter: SlidingWindowRateLimiter | null = null;

function getPsiRateLimiter(): SlidingWindowRateLimiter {
  if (!psiRateLimiter) {
    const max = readPositiveInt(
      process.env.PSI_RATE_LIMIT,
      PSI_RATE_LIMIT_PER_WINDOW,
      PSI_RATE_LIMIT_PER_WINDOW
    );
    psiRateLimiter = new SlidingWindowRateLimiter(max, PSI_RATE_WINDOW_MS);
  }
  return psiRateLimiter;
}

export function isPsiEnabled(): boolean {
  const flag = process.env.ENABLE_PSI?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  // No API key → skip PSI entirely and use heuristic page-speed checks (previous behavior).
  if (!getPsiApiKey()) return false;
  return true;
}

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number.parseInt(ip.split(".")[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

/**
 * Google’s PSI crawlers run on the public internet — they cannot open localhost / LAN URLs.
 * Calling the API with those hosts always returns HTTP 400 FAILED_DOCUMENT_REQUEST.
 */
export function isPsiPublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".localhost")
    ) {
      return false;
    }
    if (isIP(host) && isPrivateIp(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function parseGoogleError(body: string): { message: string; reason?: string } {
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string; errors?: { reason?: string; message?: string }[] };
    };
    const message = json.error?.message || body;
    const reason = json.error?.errors?.[0]?.reason;
    return { message, reason };
  } catch {
    return { message: body };
  }
}

function classifyHttpError(status: number, message: string, reason?: string): PsiErrorKind {
  if (status === 429 || /rate.?limit|quota|userRateLimitExceeded|dailyLimitExceeded/i.test(message + (reason || ""))) {
    return "rate_limit";
  }
  if (status === 403 || status === 401 || /API key|PERMISSION|accessNotConfigured|keyInvalid/i.test(message + (reason || ""))) {
    return "auth";
  }
  if (
    /FAILED_DOCUMENT_REQUEST|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT|unable to reliably load/i.test(
      message
    )
  ) {
    return "unreachable";
  }
  if (/invalid argument|INVALID_PARAMETER|Values must match/i.test(message + (reason || ""))) {
    return "invalid_url";
  }
  return "http";
}

export function formatPsiFailureHint(kind: PsiErrorKind, detail?: string): string {
  switch (kind) {
    case "private_url":
      return "PageSpeed Insights cannot reach localhost/private URLs — use a public site, or heuristics stay in use.";
    case "rate_limit":
      return "Google PageSpeed rate limit hit — retrying with a smaller sample.";
    case "auth":
      return "PageSpeed API key rejected — enable PageSpeed Insights API in Google Cloud and check the key.";
    case "unreachable":
      return "Google could not load the page (blocked, down, or not publicly reachable).";
    case "invalid_url":
      return "Invalid URL for PageSpeed Insights.";
    case "no_key":
      return "No GOOGLE_PSI_API_KEY — using heuristic page-speed checks.";
    default:
      return detail?.slice(0, 160) || "PageSpeed Insights request failed.";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPageSpeedMetrics(
  url: string,
  strategy: PsiStrategy = "mobile"
): Promise<LabMetrics> {
  if (!isPsiPublicUrl(url)) {
    return emptyMetrics(
      strategy,
      formatPsiFailureHint("private_url"),
      "private_url"
    );
  }

  const key = getPsiApiKey();
  if (!key) {
    return emptyMetrics(strategy, formatPsiFailureHint("no_key"), "no_key");
  }

  const maxAttempts = 3;
  let lastError = "";
  let lastKind: PsiErrorKind = "http";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await getPsiRateLimiter().acquire();

    const endpoint = new URL(getPsiApiUrl());
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", strategy);
    endpoint.searchParams.set("category", "performance");
    endpoint.searchParams.set("key", key);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const res = await fetch(endpoint.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const parsed = parseGoogleError(body);
        const kind = classifyHttpError(res.status, parsed.message, parsed.reason);
        lastKind = kind;
        lastError = `PSI HTTP ${res.status}: ${parsed.message}`;

        // Rate limit → wait and retry (caller may also shrink the batch)
        if (kind === "rate_limit" && attempt < maxAttempts) {
          await sleep(1500 * attempt);
          continue;
        }

        // Transient load failures on public URLs — one retry
        if (kind === "unreachable" && attempt < 2) {
          await sleep(800 * attempt);
          continue;
        }

        return emptyMetrics(strategy, lastError, kind);
      }

      const data = (await res.json()) as {
        lighthouseResult?: {
          lighthouseVersion?: string;
          categories?: { performance?: { score?: number } };
          audits?: Record<
            string,
            {
              numericValue?: number;
              title?: string;
              displayValue?: string;
              details?: { overallSavingsMs?: number; items?: { node?: { snippet?: string } }[] };
            }
          >;
        };
        loadingExperience?: unknown;
        originLoadingExperience?: unknown;
      };

      const audits = data.lighthouseResult?.audits || {};
      const score = data.lighthouseResult?.categories?.performance?.score;
      const performanceScore = typeof score === "number" ? Math.round(score * 100) : null;

      const fieldSource = data.loadingExperience || data.originLoadingExperience;
      const opportunities: LabMetrics["opportunities"] = [];
      for (const [id, audit] of Object.entries(audits)) {
        const savings = audit?.details?.overallSavingsMs;
        if (typeof savings === "number" && savings >= 50 && audit.title) {
          opportunities.push({ id, title: audit.title, savingsMs: Math.round(savings) });
        }
      }
      opportunities.sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0));

      const lcpSnippet = audits["largest-contentful-paint-element"]?.details?.items?.[0]?.node?.snippet;

      const diagnostics: string[] = [];
      if (audits["render-blocking-resources"]?.displayValue) {
        diagnostics.push(`Render-blocking: ${audits["render-blocking-resources"].displayValue}`);
      }
      if (audits["unused-javascript"]?.displayValue) {
        diagnostics.push(`Unused JS: ${audits["unused-javascript"].displayValue}`);
      }
      if (audits["uses-responsive-images"]?.displayValue) {
        diagnostics.push(`Images: ${audits["uses-responsive-images"].displayValue}`);
      }

      return {
        source: "pagespeed-insights",
        strategy,
        errorKind: "none",
        performanceScore,
        fcpMs: metricMs(audits, "first-contentful-paint"),
        lcpMs: metricMs(audits, "largest-contentful-paint"),
        cls: num(audits["cumulative-layout-shift"]?.numericValue),
        tbtMs: metricMs(audits, "total-blocking-time"),
        speedIndexMs: metricMs(audits, "speed-index"),
        ttfbMs: metricMs(audits, "server-response-time"),
        inpMs: metricMs(audits, "interaction-to-next-paint"),
        field: {
          lcpMs: fieldPercentile(fieldSource, "LARGEST_CONTENTFUL_PAINT_MS"),
          cls: fieldCls(fieldSource),
          inpMs: fieldPercentile(fieldSource, "INTERACTION_TO_NEXT_PAINT"),
          fcpMs: fieldPercentile(fieldSource, "FIRST_CONTENTFUL_PAINT_MS"),
          ttfbMs: fieldPercentile(fieldSource, "EXPERIMENTAL_TIME_TO_FIRST_BYTE"),
        },
        lcpElement: lcpSnippet?.slice(0, 300),
        opportunities: opportunities.slice(0, 8),
        diagnostics: diagnostics.slice(0, 6),
        lighthouseVersion: data.lighthouseResult?.lighthouseVersion,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : "PSI request failed";
      lastKind = /abort/i.test(message) ? "network" : "network";
      lastError = message;
      if (attempt < maxAttempts) {
        await sleep(600 * attempt);
        continue;
      }
      return emptyMetrics(strategy, lastError, lastKind);
    }
  }

  return emptyMetrics(strategy, lastError || "PSI request failed", lastKind);
}

function emptyMetrics(strategy: PsiStrategy, fetchError: string, errorKind: PsiErrorKind): LabMetrics {
  return {
    source: "pagespeed-insights",
    strategy,
    fetchError,
    errorKind,
    performanceScore: null,
    fcpMs: null,
    lcpMs: null,
    cls: null,
    tbtMs: null,
    speedIndexMs: null,
    ttfbMs: null,
    inpMs: null,
    field: { lcpMs: null, cls: null, inpMs: null, fcpMs: null, ttfbMs: null },
    opportunities: [],
    diagnostics: [],
    fetchedAt: new Date().toISOString(),
  };
}

/** Score a metric against good / needs-improvement thresholds. */
export function bandStatus(
  value: number | null | undefined,
  goodMax: number,
  okMax: number
): { status: "pass" | "warn" | "fail" | "na"; score: number } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { status: "na", score: 5 };
  }
  if (value <= goodMax) return { status: "pass", score: 5 };
  if (value <= okMax) return { status: "warn", score: 3 };
  return { status: "fail", score: 0 };
}
