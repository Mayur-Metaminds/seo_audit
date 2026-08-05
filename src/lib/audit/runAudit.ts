import type { AuditConfig, AuditReport, CrawledPage } from "@/types/audit.types";
import type { AuditProgressEvent, ProgressCallback } from "@/types/progress.types";
import { crawlSite, crawlWebflowSite, checkSensitiveFiles, check404Page, findHomepage } from "@/lib/crawler/siteCrawler";
import { enrichPagesWithRender, closeRenderBrowser, isHeadlessEnabled } from "@/lib/crawler/renderPage";
import { auditPage, auditPerformance, auditAssets, auditSecurity, auditEeat } from "@/lib/auditors";
import {
  auditBrokenLinks,
  auditDuplicateContent,
  auditArchitectureExtras,
  auditHttpProtocol,
  audit404Ux,
  auditManualIntegrations,
  auditOrphanPages,
} from "@/lib/auditors/siteChecks";
import { auditSiteLevel } from "@/lib/auditors/siteLevel";
import { buildPageResults, finalizeReport } from "@/lib/audit/scoring";
import { getDomain, generateId } from "@/lib/utils/url";
import { slimReport } from "@/lib/audit/slimReport";
import { isUnlimitedPages } from "@/lib/audit/limits";
import {
  fetchPageSpeedMetrics,
  formatPsiFailureHint,
  getPsiApiKey,
  getPsiConcurrency,
  getPsiMaxUrls,
  isPsiEnabled,
  isPsiPublicUrl,
  PSI_RATE_LIMIT_FALLBACK_CONCURRENCY,
  PSI_RATE_LIMIT_FALLBACK_MAX_URLS,
  type LabMetrics,
  type PsiErrorKind,
} from "@/lib/performance/pagespeed";
import { auditGrammarSuggestions, hasLanguageToolKey, isGrammarEnabled } from "@/lib/grammar/languageTool";
import { mapPool } from "@/lib/utils/asyncPool";

export type { AuditProgressEvent, ProgressCallback };

function pickPsiUrls(pages: CrawledPage[], seedUrl: string, limit: number): string[] {
  if (limit <= 0) return [];
  const homepage = findHomepage(pages, seedUrl);
  const ordered: string[] = [];
  if (homepage?.finalUrl && isPsiPublicUrl(homepage.finalUrl)) {
    ordered.push(homepage.finalUrl);
  }

  const contentLike = pages
    .filter(
      (p) =>
        p.statusCode >= 200 &&
        p.statusCode < 400 &&
        p.finalUrl !== homepage?.finalUrl &&
        isPsiPublicUrl(p.finalUrl)
    )
    .sort((a, b) => {
      const score = (u: string) => {
        if (/\/(blog|blogs|article|post|product|products)\//i.test(u)) return 0;
        if (u.split("/").filter(Boolean).length >= 2) return 1;
        return 2;
      };
      return score(a.finalUrl) - score(b.finalUrl);
    });

  for (const page of contentLike) {
    if (ordered.length >= limit) break;
    if (!ordered.includes(page.finalUrl)) ordered.push(page.finalUrl);
  }
  return ordered.slice(0, limit);
}

export async function runAudit(
  url: string,
  config: AuditConfig,
  onProgress?: ProgressCallback
): Promise<AuditReport> {
  const id = generateId();
  const origin = new URL(url).origin;
  let lastPercent = 0;
  const unlimited = isUnlimitedPages(config.maxPages);

  const emit = (
    event: Omit<AuditProgressEvent, "percent" | "remaining" | "discovered"> & {
      percent: number;
      remaining?: number;
      discovered?: number;
    }
  ) => {
    const percent = Math.min(100, Math.max(lastPercent, Math.round(event.percent)));
    lastPercent = percent;
    onProgress?.({
      ...event,
      percent,
      remaining: event.remaining ?? Math.max(0, (event.total || 0) - (event.current || 0)),
      discovered: event.discovered ?? event.total ?? 0,
    });
  };

  let report: AuditReport = {
    id,
    url,
    domain: getDomain(url),
    startedAt: new Date().toISOString(),
    status: "running",
    progress: { phase: "initializing", current: 0, total: 0, message: "Starting audit..." },
    config,
    pagesAudited: 0,
    totalPagesFound: 0,
    remainingUrls: [],
    pageResults: [],
    siteChecks: [],
    categoryScores: [],
    overallScore: 0,
    maxScore: 0,
    scorePercentage: 0,
    grade: "critical",
    summary: { passed: 0, warnings: 0, failed: 0, manual: 0, topIssues: [], strengths: [] },
  };

  try {
    let crawl;
    if (config.mode === "webflow") {
      emit({
        phase: "initializing",
        current: 0,
        total: 0,
        remaining: 0,
        discovered: 0,
        percent: 2,
        url,
        message: unlimited
          ? "Starting Webflow & General Web Crawl (following page links + sitemap)..."
          : `Starting Webflow & General Web Crawl (cap ${config.maxPages}; link discovery)...`,
      });

      crawl = await crawlWebflowSite(url, config, (current, discovered, remaining, pageUrl) => {
        const denom = unlimited ? Math.max(discovered, current, 1) : Math.max(config.maxPages, 1);
        const crawlShare = Math.min(1, current / denom);
        emit({
          phase: "crawling",
          current,
          total: discovered,
          discovered,
          remaining,
          percent: 5 + crawlShare * 50,
          url: pageUrl,
          message: unlimited
            ? `Crawling ${current} done · ${remaining} remaining · ${discovered} discovered via page links`
            : `Crawling ${current}/${config.maxPages} · ${discovered} discovered · ${remaining} left`,
        });
      });
    } else {
      emit({
        phase: "initializing",
        current: 0,
        total: 0,
        remaining: 0,
        discovered: 0,
        percent: 2,
        url,
        message: unlimited
          ? "Fetching robots.txt + /sitemap.xml (dig nested .xml children only; no guessed paths)..."
          : `Fetching robots.txt + /sitemap.xml (cap ${config.maxPages}; nested dig only)...`,
      });

      crawl = await crawlSite(url, config, (current, discovered, remaining, pageUrl) => {
        const denom = unlimited ? Math.max(discovered, current, 1) : Math.max(config.maxPages, 1);
        const crawlShare = Math.min(1, current / denom);
        emit({
          phase: "crawling",
          current,
          total: discovered,
          discovered,
          remaining,
          percent: 5 + crawlShare * 50,
          url: pageUrl,
          message: unlimited
            ? `Crawling ${current} done · ${remaining} remaining · ${discovered} from sitemap dig`
            : `Crawling ${current}/${config.maxPages} · ${discovered} from sitemap dig · ${remaining} left`,
        });
      });
    }

    emit({
      phase: "security",
      current: 0,
      total: 2,
      remaining: 2,
      discovered: crawl.allDiscoveredUrls.length,
      percent: 58,
      url,
      message: "Running security and 404 checks...",
    });

    const [sensitiveFiles, notFoundCheck] = await Promise.all([
      checkSensitiveFiles(origin),
      check404Page(origin),
    ]);

    emit({
      phase: "security",
      current: 2,
      total: 2,
      remaining: 0,
      discovered: crawl.allDiscoveredUrls.length,
      percent: 62,
      url,
      message: "Security checks complete",
    });

    let pages = crawl.pages;
    if (isHeadlessEnabled()) {
      emit({
        phase: "rendering",
        current: 0,
        total: pages.length,
        discovered: crawl.allDiscoveredUrls.length,
        remaining: pages.length,
        percent: 64,
        message: "Rendering pages in headless Chromium for accurate on-page SEO...",
      });
      try {
        pages = await enrichPagesWithRender(pages, {
          onProgress: (done, total, pageUrl) => {
            emit({
              phase: "rendering",
              current: done,
              total,
              discovered: crawl.allDiscoveredUrls.length,
              remaining: total - done,
              percent: 64 + (done / Math.max(total, 1)) * 8,
              url: pageUrl,
              message: `Headless render ${done}/${total}`,
            });
          },
        });
      } finally {
        await closeRenderBrowser();
      }
    }

    let psiFailureHint: string | undefined;
    let psiFailureKind: PsiErrorKind | undefined;
    let skippedPsiNoKey = false;
    let skippedPsiPrivate = false;

    if (!getPsiApiKey() && process.env.ENABLE_PSI?.trim().toLowerCase() !== "false" && process.env.ENABLE_PSI?.trim().toLowerCase() !== "0") {
      // ENABLE_PSI on but no key — fall back silently to heuristic speed checks
      skippedPsiNoKey = true;
    }

    const psiLimit = isPsiEnabled() ? getPsiMaxUrls() : 0;
    let psiUrls = pickPsiUrls(pages, url, psiLimit);

    // Google cannot crawl localhost / LAN — skip PSI early (API key is fine; URL is not public)
    if (psiLimit > 0 && psiUrls.length === 0 && pages.some((p) => p.finalUrl)) {
      const anyPublic = pages.some((p) => isPsiPublicUrl(p.finalUrl));
      if (!anyPublic) {
        skippedPsiPrivate = true;
        psiFailureKind = "private_url";
        psiFailureHint = formatPsiFailureHint("private_url");
      }
    }

    if (psiUrls.length > 0) {
      emit({
        phase: "pagespeed",
        current: 0,
        total: psiUrls.length,
        discovered: crawl.allDiscoveredUrls.length,
        remaining: psiUrls.length,
        percent: 74,
        message: `Running Google PageSpeed Insights (Lighthouse) on ${psiUrls.length} URL(s)...`,
      });

      try {
        const psiResults = new Map<string, LabMetrics>();
        let concurrency = getPsiConcurrency();
        let rateLimited = false;

        const runBatch = async (batch: string[], parallel: number, label: string) => {
          emit({
            phase: "pagespeed",
            current: psiResults.size,
            total: Math.max(batch.length, psiUrls.length),
            discovered: crawl.allDiscoveredUrls.length,
            remaining: batch.length,
            percent: 74,
            message: label,
          });

          await mapPool(
            batch,
            parallel,
            async (psiUrl) => {
              try {
                const metrics = await fetchPageSpeedMetrics(psiUrl, "mobile");
                // Always attach (including fetchError) so evidence shows real PSI failure, not "missing key"
                psiResults.set(psiUrl, metrics);
                if (metrics.fetchError) {
                  psiFailureHint = metrics.fetchError;
                  psiFailureKind = metrics.errorKind || "http";
                  if (metrics.errorKind === "rate_limit") rateLimited = true;
                }
              } catch (err) {
                psiFailureHint = err instanceof Error ? err.message : "PSI request failed";
                psiFailureKind = "network";
              }
              return psiUrl;
            },
            (done, total, psiUrl) => {
              emit({
                phase: "pagespeed",
                current: Math.min(psiResults.size + done, total),
                total,
                discovered: crawl.allDiscoveredUrls.length,
                remaining: total - done,
                percent: 74 + (done / Math.max(total, 1)) * 8,
                url: psiUrl,
                message: `PSI ${done}/${total} done (parallel ×${parallel})`,
              });
            }
          );
        };

        await runBatch(
          psiUrls,
          concurrency,
          `PSI batch: ${psiUrls.length} URL(s), concurrency ${concurrency}...`
        );

        // Rate-limited with no successes → shrink sample and retry once at minimal concurrency
        if (rateLimited && psiResults.size === 0) {
          const fallbackUrls = psiUrls.slice(0, PSI_RATE_LIMIT_FALLBACK_MAX_URLS);
          concurrency = PSI_RATE_LIMIT_FALLBACK_CONCURRENCY;
          psiUrls = fallbackUrls;
          rateLimited = false;
          emit({
            phase: "pagespeed",
            current: 0,
            total: fallbackUrls.length,
            discovered: crawl.allDiscoveredUrls.length,
            remaining: fallbackUrls.length,
            percent: 76,
            message: `Google rate limit — retrying ${fallbackUrls.length} URL(s) at concurrency ${concurrency}...`,
          });
          await runBatch(
            fallbackUrls,
            concurrency,
            `PSI fallback: ${fallbackUrls.length} URL(s), concurrency ${concurrency}...`
          );
        } else if (rateLimited && psiResults.size > 0) {
          // Partial success under pressure — keep what we have; clear scary hint
          psiFailureHint = undefined;
          psiFailureKind = undefined;
        }

        pages = pages.map((page) => {
          const metrics = psiResults.get(page.finalUrl);
          return metrics ? { ...page, labMetrics: metrics } : page;
        });

        const psiSuccessCount = [...psiResults.values()].filter((m) => !m.fetchError).length;
        if (psiSuccessCount === 0 && psiFailureHint) {
          // keep hint — all measured URLs failed
        } else if (psiSuccessCount > 0) {
          psiFailureHint = undefined;
          psiFailureKind = undefined;
        }
      } catch (err) {
        psiFailureHint = err instanceof Error ? err.message : "PSI phase failed";
        psiFailureKind = "network";
      }
    } else if (skippedPsiNoKey) {
      emit({
        phase: "pagespeed",
        current: 0,
        total: 0,
        discovered: crawl.allDiscoveredUrls.length,
        remaining: 0,
        percent: 74,
        message: "No GOOGLE_PSI_API_KEY — using heuristic page-speed checks",
      });
    } else if (skippedPsiPrivate) {
      emit({
        phase: "pagespeed",
        current: 0,
        total: 0,
        discovered: crawl.allDiscoveredUrls.length,
        remaining: 0,
        percent: 74,
        message: "Skipping PSI for localhost/private URLs (Google cannot reach them) — heuristics in use",
      });
    }

    const homepage = findHomepage(pages, url);
    const pagesToAudit = pages.filter((p) => p.statusCode !== 0);
    const crawlWithPages = { ...crawl, pages };

    const allChecks = [];
    const pageData = [];

    for (let i = 0; i < pagesToAudit.length; i++) {
      const page = pagesToAudit[i];
      const auditShare = pagesToAudit.length > 0 ? (i + 1) / pagesToAudit.length : 1;
      const remainingAudit = pagesToAudit.length - (i + 1);

      emit({
        phase: "auditing",
        current: i + 1,
        total: pagesToAudit.length,
        discovered: crawl.allDiscoveredUrls.length,
        remaining: remainingAudit + crawl.remainingUrls.length,
        percent: 84 + auditShare * 10,
        url: page.finalUrl || page.url,
        message: `Auditing ${i + 1}/${pagesToAudit.length} · ${remainingAudit} pages left to score`,
      });

      const pageChecks = [...auditPage(page, url), ...auditPerformance(page), ...auditAssets(page)];

      pageData.push({
        url: page.url,
        finalUrl: page.finalUrl,
        statusCode: page.statusCode,
        responseTimeMs: page.ttfbMs || page.responseTimeMs,
        contentLength: page.contentLength,
        checks: pageChecks,
      });

      allChecks.push(...pageChecks);
    }

    let grammarSuggestions: AuditReport["grammarSuggestions"] = [];
    let grammarError: string | undefined;

    if (isGrammarEnabled()) {
      emit({
        phase: "grammar",
        current: 0,
        total: pagesToAudit.length,
        discovered: crawl.allDiscoveredUrls.length,
        remaining: pagesToAudit.length,
        percent: 94,
        message: hasLanguageToolKey()
          ? "Checking grammar & writing suggestions (not scored)..."
          : "Grammar tips via free LanguageTool (no API key) — not scored...",
      });
      try {
        const grammar = await auditGrammarSuggestions(pagesToAudit, {
          onProgress: (done, total, pageUrl) => {
            emit({
              phase: "grammar",
              current: done,
              total,
              discovered: crawl.allDiscoveredUrls.length,
              remaining: total - done,
              percent: 94 + (done / Math.max(total, 1)) * 1.5,
              url: pageUrl,
              message: `Grammar tips ${done}/${total} (advisory only)`,
            });
          },
        });
        grammarSuggestions = grammar.pages;
        // Soft note only — never fail the audit
        if (grammar.error && grammar.pages.length === 0) {
          grammarError = grammar.error;
        }
      } catch (err) {
        grammarSuggestions = [];
        grammarError =
          err instanceof Error
            ? `Grammar skipped: ${err.message}`
            : "Grammar skipped (service unavailable)";
      }
    }

    emit({
      phase: "finalizing",
      current: pagesToAudit.length,
      total: pagesToAudit.length,
      remaining: crawl.remainingUrls.length,
      discovered: crawl.allDiscoveredUrls.length,
      percent: 96,
      message: "Aggregating site-level checks and scoring...",
    });

    const siteChecks = [
      ...auditSiteLevel(crawlWithPages, url),
      auditOrphanPages(crawlWithPages, url),
      auditDuplicateContent(crawlWithPages),
      auditBrokenLinks(crawlWithPages, url),
      ...auditArchitectureExtras(crawlWithPages, url),
      auditHttpProtocol(homepage),
      audit404Ux(notFoundCheck),
      ...auditManualIntegrations(),
    ];

    const securityChecks = auditSecurity(
      homepage || pages[0] || ({ headers: {}, html: "" } as never),
      sensitiveFiles,
      notFoundCheck
    );
    const eeatChecks = auditEeat(crawlWithPages);

    allChecks.push(...siteChecks, ...securityChecks, ...eeatChecks);

    report = {
      ...report,
      pagesAudited: pages.length,
      totalPagesFound: crawl.allDiscoveredUrls.length,
      remainingUrls: crawl.remainingUrls,
    };

    const finalReport = slimReport(finalizeReport(report, allChecks, buildPageResults(pageData)));
    finalReport.grammarSuggestions = (grammarSuggestions || []).slice(0, 20).map((p) => ({
      url: p.url,
      textSampleChars: p.textSampleChars,
      suggestions: p.suggestions.slice(0, 30).map((s) => ({
        message: s.message.slice(0, 400),
        shortMessage: s.shortMessage?.slice(0, 120),
        context: s.context.slice(0, 220),
        replacements: s.replacements.slice(0, 5),
        ruleId: s.ruleId,
        category: s.category,
      })),
    }));
    if (grammarError) finalReport.grammarError = grammarError.slice(0, 300);

    if (finalReport.remainingUrls.length > 0) {
      finalReport.summary.topIssues = [
        `${finalReport.remainingUrls.length} URL(s) discovered but not audited yet — see Remaining Pages list.`,
        ...finalReport.summary.topIssues,
      ].slice(0, 15);
    }

    const psiOk = pages.some((p) => p.labMetrics && !p.labMetrics.fetchError);
    const renderedCount = pages.filter((p) => p.rendered).length;
    if (psiFailureKind === "private_url" || skippedPsiPrivate) {
      finalReport.summary.topIssues = [
        formatPsiFailureHint("private_url"),
        ...finalReport.summary.topIssues,
      ].slice(0, 15);
    } else if (psiFailureHint) {
      const clean =
        psiFailureKind && psiFailureKind !== "http" && psiFailureKind !== "network"
          ? formatPsiFailureHint(psiFailureKind, psiFailureHint)
          : `PageSpeed Insights unavailable — using heuristic speed checks. (${psiFailureHint.slice(0, 120)})`;
      finalReport.summary.topIssues = [clean, ...finalReport.summary.topIssues].slice(0, 15);
    } else if (skippedPsiNoKey) {
      finalReport.summary.strengths = [
        "Page speed: heuristic mode (add GOOGLE_PSI_API_KEY for Lighthouse/CrUX)",
        ...finalReport.summary.strengths,
      ].slice(0, 10);
    } else if (psiOk) {
      const measured = pages.filter((p) => p.labMetrics && !p.labMetrics.fetchError).length;
      finalReport.summary.strengths = [
        `Page speed: Google PageSpeed / Lighthouse on ${measured} sampled URL(s)`,
        ...finalReport.summary.strengths,
      ].slice(0, 10);
    }
    if (renderedCount > 0 || psiOk) {
      finalReport.summary.strengths = [
        [
          renderedCount > 0 ? `Headless render verified ${renderedCount} page(s)` : null,
          psiOk ? "Page speed measured via Google PageSpeed Insights / Lighthouse" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        ...finalReport.summary.strengths,
      ].slice(0, 10);
    }

    emit({
      phase: "complete",
      current: finalReport.pagesAudited,
      total: finalReport.totalPagesFound,
      discovered: finalReport.totalPagesFound,
      remaining: finalReport.remainingUrls.length,
      percent: 100,
      message:
        finalReport.remainingUrls.length > 0
          ? `Complete — ${finalReport.pagesAudited} audited, ${finalReport.remainingUrls.length} remaining`
          : `Complete — all ${finalReport.pagesAudited} discovered pages audited`,
    });

    return finalReport;
  } catch (error) {
    await closeRenderBrowser().catch(() => undefined);
    const message = error instanceof Error ? error.message : "Audit failed";
    emit({
      phase: "failed",
      current: 0,
      total: 0,
      remaining: 0,
      discovered: 0,
      percent: lastPercent,
      message,
    });

    return {
      ...report,
      status: "failed",
      error: message,
      progress: { phase: "failed", current: 0, total: 0, message: "Audit failed" },
    };
  }
}
