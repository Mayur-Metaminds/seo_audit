import type { CheckResult, CrawledPage } from "@/types/audit.types";
import { enrichWithExplainer } from "@/data/checkpointExplainers";
import { bandStatus, type LabMetrics } from "@/lib/performance/pagespeed";
import { getImages, parseHtml } from "@/lib/utils/html";

function makeResult(
  checkpointId: number,
  status: CheckResult["status"],
  score: number,
  maxScore: number,
  message: string,
  options?: Partial<CheckResult>
): CheckResult {
  const explainerFields = enrichWithExplainer(checkpointId, status, {
    confidence: options?.confidence,
    whyItMatters: options?.whyItMatters,
    seoImpact: options?.seoImpact,
    howToVerify: options?.howToVerify,
  });
  return {
    checkpointId,
    status,
    score,
    maxScore,
    message,
    scope: options?.scope || "page",
    ...explainerFields,
    ...options,
    isGenuineSeoIssue: options?.isGenuineSeoIssue ?? explainerFields.isGenuineSeoIssue,
  };
}

function fmtMs(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  return `${Math.round(v)}ms`;
}

function metricEvidence(lab: LabMetrics, key: string, labValue: number | null, fieldValue: number | null): string[] {
  const lines = [
    `Source: Google PageSpeed Insights (Lighthouse ${lab.lighthouseVersion || "lab"} · ${lab.strategy})`,
    `Lab ${key}: ${labValue === null ? "n/a" : typeof labValue === "number" && key === "CLS" ? labValue.toFixed(3) : fmtMs(labValue)}`,
  ];
  if (fieldValue !== null && fieldValue !== undefined) {
    lines.push(
      `Field CrUX p75 ${key}: ${key === "CLS" ? Number(fieldValue).toFixed(3) : fmtMs(fieldValue)} (ranking-relevant when present)`
    );
  } else {
    lines.push("Field CrUX: insufficient data for this URL/origin");
  }
  if (lab.performanceScore !== null) lines.push(`Lighthouse Performance score: ${lab.performanceScore}/100`);
  return lines;
}

/**
 * Build page-speed checks from real PSI/Lighthouse metrics.
 * Prefers CrUX field data for CWV (LCP/INP/CLS) when available.
 */
export function auditPerformanceFromLab(page: CrawledPage, lab: LabMetrics): CheckResult[] {
  const url = page.finalUrl;
  const checks: CheckResult[] = [];

  if (lab.fetchError) {
    // Fall through to proxies in caller; return empty so proxies apply
    return [];
  }

  const ttfb = lab.field.ttfbMs ?? lab.ttfbMs ?? page.ttfbMs;
  const ttfbBand = bandStatus(ttfb, 800, 1800);
  checks.push(
    makeResult(
      27,
      ttfbBand.status === "na" ? "warn" : ttfbBand.status,
      ttfbBand.status === "na" ? 3 : ttfbBand.score,
      5,
      `TTFB ${fmtMs(ttfb)} (${lab.field.ttfbMs != null ? "CrUX p75" : "Lighthouse lab"})`,
      {
        scope: "page",
        confidence: "measured",
        evidence: metricEvidence(lab, "TTFB", lab.ttfbMs, lab.field.ttfbMs),
        recommendation: "Target TTFB ≤800ms (good). Use CDN, caching, and faster origin responses.",
        issueCode: lab.ttfbMs != null && lab.ttfbMs > 800 ? `Server response time: ${fmtMs(lab.ttfbMs)}` : undefined,
        solutionCode: `// Cache HTML/API at the edge; avoid blocking origin work on every request\nCache-Control: public, s-maxage=60, stale-while-revalidate=300`,
        affectedUrls: [url],
        measuredValue: ttfb ?? undefined,
        measuredUnit: "ms",
      }
    )
  );

  const fcp = lab.field.fcpMs ?? lab.fcpMs;
  const fcpBand = bandStatus(fcp, 1800, 3000);
  checks.push(
    makeResult(
      28,
      fcpBand.status === "na" ? "warn" : fcpBand.status,
      fcpBand.status === "na" ? 3 : fcpBand.score,
      5,
      `FCP ${fmtMs(fcp)}`,
      {
        scope: "page",
        confidence: "measured",
        evidence: [
          ...metricEvidence(lab, "FCP", lab.fcpMs, lab.field.fcpMs),
          ...lab.diagnostics.slice(0, 2),
        ],
        recommendation: "Eliminate render-blocking CSS/JS; inline critical CSS; defer non-critical scripts.",
        affectedUrls: [url],
        measuredValue: fcp ?? undefined,
        measuredUnit: "ms",
      }
    )
  );

  const lcp = lab.field.lcpMs ?? lab.lcpMs;
  const lcpBand = bandStatus(lcp, 2500, 4000);
  checks.push(
    makeResult(
      29,
      lcpBand.status === "na" ? "warn" : lcpBand.status,
      lcpBand.status === "na" ? 3 : lcpBand.score,
      5,
      `LCP ${fmtMs(lcp)}${lab.field.lcpMs != null ? " (field)" : " (lab)"}`,
      {
        scope: "page",
        confidence: "measured",
        evidence: [
          ...metricEvidence(lab, "LCP", lab.lcpMs, lab.field.lcpMs),
          ...(lab.lcpElement ? [`LCP element: ${lab.lcpElement}`] : []),
          ...lab.opportunities.slice(0, 3).map((o) => `${o.title}${o.savingsMs ? ` (~${o.savingsMs}ms)` : ""}`),
        ],
        recommendation:
          "Preload the LCP image, serve modern formats (AVIF/WebP), set priority hints, and never lazy-load the LCP element.",
        issueCode: lab.lcpElement ? `- ${lab.lcpElement}` : undefined,
        solutionCode: `<link rel="preload" as="image" href="/hero.webp" fetchpriority="high" />\n<img src="/hero.webp" width="1200" height="630" fetchpriority="high" alt="..." />`,
        affectedUrls: [url],
        measuredValue: lcp ?? undefined,
        measuredUnit: "ms",
      }
    )
  );

  const inp = lab.field.inpMs ?? lab.inpMs;
  const inpBand = bandStatus(inp, 200, 500);
  checks.push(
    makeResult(
      30,
      inp == null ? "na" : inpBand.status,
      inp == null ? 5 : inpBand.score,
      5,
      inp == null
        ? "INP unavailable in lab — check CrUX field data when traffic exists"
        : `INP ${fmtMs(inp)}${lab.field.inpMs != null ? " (field)" : " (lab)"}`,
      {
        scope: "page",
        confidence: inp == null ? "medium" : "measured",
        evidence: metricEvidence(lab, "INP", lab.inpMs, lab.field.inpMs),
        recommendation: "Break up long tasks, reduce third-party JS, defer non-critical hydration.",
        affectedUrls: [url],
        measuredValue: inp ?? undefined,
        measuredUnit: "ms",
        isGenuineSeoIssue: inp != null && inpBand.status !== "pass",
      }
    )
  );

  const cls = lab.field.cls ?? lab.cls;
  const clsBand = bandStatus(cls, 0.1, 0.25);
  checks.push(
    makeResult(
      31,
      clsBand.status === "na" ? "warn" : clsBand.status,
      clsBand.status === "na" ? 3 : clsBand.score,
      5,
      `CLS ${cls == null ? "n/a" : cls.toFixed(3)}${lab.field.cls != null ? " (field)" : " (lab)"}`,
      {
        scope: "page",
        confidence: "measured",
        evidence: metricEvidence(lab, "CLS", lab.cls, lab.field.cls),
        recommendation: "Set width/height or aspect-ratio on images and embeds; reserve space for ads/banners.",
        solutionCode: `<img src="/banner.webp" width="1200" height="630" alt="..." style="aspect-ratio:1200/630" />`,
        affectedUrls: [url],
        measuredValue: cls ?? undefined,
        measuredUnit: "cls",
      }
    )
  );

  const tbtBand = bandStatus(lab.tbtMs, 200, 600);
  checks.push(
    makeResult(
      32,
      tbtBand.status === "na" ? "warn" : tbtBand.status,
      tbtBand.status === "na" ? 3 : tbtBand.score,
      5,
      `TBT ${fmtMs(lab.tbtMs)} (lab)`,
      {
        scope: "page",
        confidence: "measured",
        evidence: [
          `Lighthouse Total Blocking Time: ${fmtMs(lab.tbtMs)}`,
          "TBT is a lab diagnostic that correlates with INP — not a field CWV.",
          ...lab.opportunities.filter((o) => /javascript|script|boot/i.test(o.title)).slice(0, 3).map((o) => o.title),
        ],
        recommendation: "Code-split, remove unused JS, defer analytics until interaction.",
        affectedUrls: [url],
        measuredValue: lab.tbtMs ?? undefined,
        measuredUnit: "ms",
      }
    )
  );

  const siBand = bandStatus(lab.speedIndexMs, 3400, 5800);
  checks.push(
    makeResult(
      33,
      siBand.status === "na" ? "warn" : siBand.status,
      siBand.status === "na" ? 3 : siBand.score,
      5,
      `Speed Index ${fmtMs(lab.speedIndexMs)} (lab)`,
      {
        scope: "page",
        confidence: "measured",
        evidence: [`Lighthouse Speed Index: ${fmtMs(lab.speedIndexMs)}`],
        recommendation: "Prioritize above-the-fold CSS/content; reduce late-loading hero assets.",
        affectedUrls: [url],
        measuredValue: lab.speedIndexMs ?? undefined,
        measuredUnit: "ms",
      }
    )
  );

  // #21 CWV aggregate — prefer field metrics
  const cwvParts = [
    { name: "LCP", status: lcpBand.status, value: lcp },
    { name: "INP", status: inp == null ? "na" : inpBand.status, value: inp },
    { name: "CLS", status: clsBand.status, value: cls },
  ];
  const cwvFails = cwvParts.filter((p) => p.status === "fail").length;
  const cwvWarns = cwvParts.filter((p) => p.status === "warn").length;
  const cwvStatus = cwvFails > 0 ? "fail" : cwvWarns > 0 ? "warn" : "pass";
  const cwvScore = cwvFails > 0 ? 2 : cwvWarns > 0 ? 6 : 10;

  checks.push(
    makeResult(
      21,
      cwvStatus,
      cwvScore,
      10,
      cwvStatus === "pass"
        ? "Core Web Vitals look healthy (PSI lab/field)"
        : `Core Web Vitals need work (${cwvFails} poor, ${cwvWarns} NI)`,
      {
        scope: "page",
        confidence: "measured",
        evidence: [
          `Performance score: ${lab.performanceScore ?? "n/a"}/100`,
          `LCP ${fmtMs(lcp)} · INP ${fmtMs(inp)} · CLS ${cls == null ? "n/a" : cls.toFixed(3)}`,
          lab.field.lcpMs != null || lab.field.cls != null || lab.field.inpMs != null
            ? "Using CrUX field data where available (ranking-relevant)"
            : "Lab-only for this URL (no CrUX field sample yet)",
          ...lab.opportunities.slice(0, 4).map((o) => `Opportunity: ${o.title}`),
        ],
        recommendation: "Fix LCP/INP/CLS to 'good' thresholds; re-check Search Console CWV after deploying.",
        affectedUrls: [url],
      }
    )
  );

  return checks;
}

export function auditPerformance(page: CrawledPage): CheckResult[] {
  if (page.labMetrics && !page.labMetrics.fetchError) {
    const measured = auditPerformanceFromLab(page, page.labMetrics);
    if (measured.length > 0) return measured;
  }
  return auditPerformanceProxy(page);
}

export type PerfProxyReason =
  | "no_key"
  | "private_url"
  | "psi_failed"
  | "not_sampled"
  | "disabled";

/** Why this page did not get measured Lighthouse metrics. */
export function getPerfProxyReason(page: CrawledPage): PerfProxyReason {
  if (page.labMetrics?.fetchError) {
    const kind = page.labMetrics.errorKind;
    if (kind === "private_url") return "private_url";
    if (kind === "no_key") return "no_key";
    return "psi_failed";
  }
  const flag = process.env.ENABLE_PSI?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return "disabled";

  const key =
    process.env.GOOGLE_PSI_API_KEY?.trim() ||
    process.env.PAGESPEED_API_KEY?.trim() ||
    process.env.PSI_API_KEY?.trim();
  if (!key) return "no_key";

  try {
    const host = new URL(page.finalUrl).hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "127.0.0.1" ||
      host === "0.0.0.0"
    ) {
      return "private_url";
    }
  } catch {
    /* ignore */
  }

  // Key present + public URL but no labMetrics → this URL was outside PSI sample batch
  return "not_sampled";
}

function proxyReasonCopy(reason: PerfProxyReason, page: CrawledPage): {
  note: string;
  cwvMessage: string;
  recommendation: string;
} {
  switch (reason) {
    case "private_url":
      return {
        note: "Heuristic only — Google PageSpeed cannot reach localhost/private URLs. Deploy publicly or use a tunnel for real Lighthouse.",
        cwvMessage: "Core Web Vitals not measured (site not public to Google PSI)",
        recommendation:
          "Audit a publicly reachable HTTPS URL. Localhost can never get Google PSI / Lighthouse lab data.",
      };
    case "no_key":
      return {
        note: "Heuristic only — not Lighthouse. Set GOOGLE_PSI_API_KEY (and enable the PageSpeed Insights API) for measured CWV.",
        cwvMessage: "Core Web Vitals not measured — GOOGLE_PSI_API_KEY missing",
        recommendation: "Add GOOGLE_PSI_API_KEY to server env, enable PageSpeed Insights API in Google Cloud, re-run.",
      };
    case "psi_failed":
      return {
        note: `Heuristic fallback — PSI/Lighthouse failed for this URL: ${page.labMetrics?.fetchError?.slice(0, 160) || "unknown error"}`,
        cwvMessage: "Core Web Vitals not measured — PageSpeed Insights request failed",
        recommendation:
          "Check that the URL is publicly reachable, not blocked by bot protection, and the API key has PageSpeed Insights enabled.",
      };
    case "disabled":
      return {
        note: "Heuristic only — ENABLE_PSI is off.",
        cwvMessage: "Core Web Vitals not measured — PSI disabled",
        recommendation: "Set ENABLE_PSI=true and GOOGLE_PSI_API_KEY for Lighthouse measurements.",
      };
    default:
      return {
        note: "Heuristic only for this URL — Lighthouse ran on a site sample (homepage + key pages), not every crawl URL.",
        cwvMessage: "Core Web Vitals measured on sample URLs only (this page not in PSI batch)",
        recommendation:
          "Raise PSI_MAX_URLS to sample more pages, or open homepage / priority pages for full Lighthouse scores.",
      };
  }
}

/** HTML-weight heuristics — only used when PSI metrics are unavailable. */
export function auditPerformanceProxy(page: CrawledPage): CheckResult[] {
  const checks: CheckResult[] = [];
  const $ = parseHtml(page.html);
  const url = page.finalUrl;
  const ttfb = page.ttfbMs || page.responseTimeMs;
  const pageSizeKb = page.contentLength / 1024;
  const scripts = $("script").length;
  const stylesheets = $('link[rel="stylesheet"]').length;
  const images = getImages($);
  const imagesWithoutDims = images.filter((img) => !img.hasDimensions);

  const reason = getPerfProxyReason(page);
  const { note: proxyNote, cwvMessage, recommendation: proxyRec } = proxyReasonCopy(reason, page);

  checks.push(
    makeResult(
      27,
      ttfb > 1000 ? "fail" : ttfb > 600 ? "warn" : "pass",
      ttfb > 1000 ? 0 : ttfb > 600 ? 3 : 5,
      5,
      `TTFB ${ttfb}ms (crawl fetch)`,
      {
        scope: "page",
        confidence: "low",
        evidence: [proxyNote, `Observed during HTML crawl fetch: ${ttfb}ms`],
        recommendation: proxyRec,
        affectedUrls: [url],
        // Crawl TTFB can flag slow origin even without Lighthouse — keep soft
        isGenuineSeoIssue: reason !== "private_url" && ttfb > 1000,
      }
    )
  );

  const heavy = pageSizeKb > 3000;
  const large = pageSizeKb > 1500;
  // Heuristics must not hard-fail CWV — only PSI/Lighthouse may fail those checkpoints.
  checks.push(
    makeResult(28, heavy ? "warn" : large ? "warn" : "pass", heavy ? 2 : large ? 3 : 5, 5, `FCP proxy via HTML weight ${pageSizeKb.toFixed(0)}KB`, {
      scope: "page",
      confidence: "low",
      evidence: [proxyNote],
      recommendation: proxyRec,
      affectedUrls: [url],
      isGenuineSeoIssue: false,
    })
  );
  checks.push(
    makeResult(29, heavy ? "warn" : large ? "warn" : "pass", heavy ? 2 : large ? 3 : 5, 5, `LCP proxy via HTML weight ${pageSizeKb.toFixed(0)}KB`, {
      scope: "page",
      confidence: "low",
      evidence: [proxyNote, "Replace with PageSpeed Insights LCP for ranking-accurate results"],
      recommendation: proxyRec,
      affectedUrls: [url],
      isGenuineSeoIssue: false,
    })
  );

  const dimFail = imagesWithoutDims.length > images.length * 0.5 && images.length > 0;
  checks.push(
    makeResult(
      31,
      dimFail ? "warn" : "pass",
      dimFail ? 2 : 5,
      5,
      dimFail
        ? `${imagesWithoutDims.length}/${images.length} images missing dimensions (CLS risk heuristic)`
        : "Image dimensions mostly set (CLS heuristic)",
      {
        scope: "page",
        confidence: "medium",
        evidence: [proxyNote, "Missing width/height commonly causes CLS — validate with PSI CLS"],
        recommendation: "Add explicit width and height (or aspect-ratio) to images.",
        affectedUrls: [url],
        isGenuineSeoIssue: dimFail,
      }
    )
  );

  const scriptFail = scripts > 30;
  const scriptWarn = scripts > 15;
  checks.push(
    makeResult(30, scriptFail || scriptWarn ? "warn" : "pass", scriptFail ? 2 : scriptWarn ? 3 : 4, 5, `INP proxy via script count (${scripts})`, {
      scope: "page",
      confidence: "low",
      evidence: [proxyNote, "INP requires CrUX field data from PageSpeed Insights"],
      recommendation: proxyRec,
      affectedUrls: [url],
      isGenuineSeoIssue: false,
    })
  );
  checks.push(
    makeResult(32, scriptFail || scriptWarn ? "warn" : "pass", scriptFail ? 2 : scriptWarn ? 3 : 5, 5, `TBT proxy via script count (${scripts})`, {
      scope: "page",
      confidence: "low",
      evidence: [proxyNote],
      recommendation: proxyRec,
      affectedUrls: [url],
      isGenuineSeoIssue: false,
    })
  );

  checks.push(
    makeResult(
      33,
      stylesheets > 10 || pageSizeKb > 2000 ? "warn" : "pass",
      stylesheets > 10 || pageSizeKb > 2000 ? 3 : 5,
      5,
      "Speed Index heuristic",
      {
        scope: "page",
        confidence: "low",
        evidence: [proxyNote],
        recommendation: proxyRec,
        affectedUrls: [url],
        isGenuineSeoIssue: false,
      }
    )
  );

  checks.push(
    makeResult(21, "manual", 10, 10, cwvMessage, {
      scope: "page",
      confidence: "low",
      evidence: [
        proxyNote,
        "Without Google PageSpeed Insights we refuse to claim CWV pass/fail (avoids false scores).",
      ],
      recommendation: proxyRec,
      isGenuineSeoIssue: false,
      suggestion: "https://developers.google.com/speed/docs/insights/v5/get-started",
    })
  );

  return checks;
}
