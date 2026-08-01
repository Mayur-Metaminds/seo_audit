/**
 * Headless Chromium rendering for on-page SEO truth (post-JS DOM).
 * Gracefully no-ops when Playwright/Chromium is unavailable (e.g. slim serverless).
 */

import type { CrawledPage } from "@/types/audit.types";
import { mapPool, readPositiveInt } from "@/lib/utils/asyncPool";

export function isHeadlessEnabled(): boolean {
  const flag = process.env.ENABLE_HEADLESS_RENDER?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) return false;
  return true;
}

export function getRenderMaxPages(): number {
  return readPositiveInt(process.env.RENDER_MAX_PAGES, 40, 200);
}

export function getRenderConcurrency(): number {
  // Chromium contexts are heavy — keep default modest
  return readPositiveInt(process.env.RENDER_CONCURRENCY, 4, 12);
}

let browserPromise: Promise<import("playwright").Browser | null> | null = null;

async function getBrowser(): Promise<import("playwright").Browser | null> {
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        const { chromium } = await import("playwright");
        return await chromium.launch({
          headless: true,
          args: ["--disable-dev-shm-usage", "--no-sandbox"],
        });
      } catch (err) {
        console.warn("[renderPage] Playwright unavailable:", err instanceof Error ? err.message : err);
        return null;
      }
    })();
  }
  return browserPromise;
}

export async function closeRenderBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser?.close();
  } catch {
    // ignore
  } finally {
    browserPromise = null;
  }
}

export interface RenderResult {
  html: string;
  rendered: boolean;
  renderMs: number;
  error?: string;
}

/**
 * Load URL in Chromium, wait for network settle, return post-JS HTML.
 */
export async function renderPageHtml(url: string, timeoutMs = 25000): Promise<RenderResult> {
  const start = Date.now();
  const browser = await getBrowser();
  if (!browser) {
    return { html: "", rendered: false, renderMs: Date.now() - start, error: "Chromium not available" };
  }

  let context: import("playwright").BrowserContext | null = null;
  try {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (compatible; MetamindsSEOCheck; +https://metaminds.studio) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 1365, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Allow hydration / late content without waiting forever
    await page.waitForLoadState("networkidle", { timeout: Math.min(8000, timeoutMs) }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 500));

    const html = await page.content();
    const status = response?.status() || 0;

    if (!html || status >= 400) {
      return {
        html,
        rendered: Boolean(html),
        renderMs: Date.now() - start,
        error: status >= 400 ? `Render got HTTP ${status}` : "Empty render HTML",
      };
    }

    return { html, rendered: true, renderMs: Date.now() - start };
  } catch (err) {
    return {
      html: "",
      rendered: false,
      renderMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Render failed",
    };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

/** Enrich crawled pages with headless DOM for accurate on-page checks. */
export async function enrichPagesWithRender(
  pages: CrawledPage[],
  options?: { maxPages?: number; onProgress?: (done: number, total: number, url: string) => void }
): Promise<CrawledPage[]> {
  if (!isHeadlessEnabled()) return pages;

  const max = options?.maxPages ?? getRenderMaxPages();
  const targets = pages.filter((p) => p.statusCode >= 200 && p.statusCode < 400 && p.html).slice(0, max);
  if (targets.length === 0) return pages;

  const browser = await getBrowser();
  if (!browser) return pages;

  const renderedMap = new Map<string, { html: string; renderMs: number }>();
  const concurrency = getRenderConcurrency();

  await mapPool(
    targets,
    concurrency,
    async (page) => {
      const result = await renderPageHtml(page.finalUrl);
      if (result.rendered && result.html.length > 100) {
        renderedMap.set(page.finalUrl, { html: result.html, renderMs: result.renderMs });
      }
      return page.finalUrl;
    },
    (done, total, page) => options?.onProgress?.(done, total, page.finalUrl)
  );

  return pages.map((page) => {
    const hit = renderedMap.get(page.finalUrl);
    if (!hit) return page;
    return {
      ...page,
      rawHtml: page.rawHtml || page.html,
      html: hit.html,
      rendered: true,
      renderMs: hit.renderMs,
      contentLength: Buffer.byteLength(hit.html, "utf8"),
    };
  });
}
