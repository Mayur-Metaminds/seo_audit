import type { CrawledPage } from "@/types/audit.types";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; MetamindsSEOCheck; +https://metaminds.studio)";

const FETCH_TIMEOUT = 15000;

export interface FetchOptions {
  accept?: string;
  maxRedirects?: number;
}

function isBinaryContentType(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType.includes("octet-stream") ||
    contentType.includes("font/")
  );
}

export async function fetchWithRedirects(
  url: string,
  options: FetchOptions = {}
): Promise<CrawledPage> {
  const maxRedirects = options.maxRedirects ?? 5;
  const accept =
    options.accept ??
    "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7";

  const redirectChain: string[] = [];
  const redirectStatuses: number[] = [];
  let currentUrl = url;
  const start = Date.now();
  let ttfbMs = 0;

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const requestStart = Date.now();

    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
          "Accept-Encoding": "gzip, deflate, br",
        },
      });

      if (ttfbMs === 0) ttfbMs = Date.now() - requestStart;
      clearTimeout(timeout);

      const statusCode = response.status;
      const location = response.headers.get("location");

      if (statusCode >= 300 && statusCode < 400 && location) {
        redirectChain.push(currentUrl);
        redirectStatuses.push(statusCode);
        const next = new URL(location, currentUrl).toString();
        if (redirectChain.includes(next)) {
          return buildPage(url, next, 310, "", {}, Date.now() - start, ttfbMs, redirectChain, redirectStatuses);
        }
        currentUrl = next;
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      const isBinary = isBinaryContentType(contentType);

      let html = "";
      if (!isBinary) {
        html = await response.text();
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const contentLength = html
        ? Buffer.byteLength(html, "utf8")
        : Number.parseInt(headers["content-length"] || "0", 10) || 0;

      return {
        url,
        finalUrl: currentUrl,
        statusCode,
        html,
        headers,
        responseTimeMs: Date.now() - start,
        ttfbMs,
        contentLength,
        redirectChain,
        redirectStatuses,
        contentType,
        error: undefined,
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  return buildPage(url, currentUrl, 310, "", {}, Date.now() - start, ttfbMs, redirectChain, redirectStatuses);
}

function buildPage(
  url: string,
  finalUrl: string,
  statusCode: number,
  html: string,
  headers: Record<string, string>,
  responseTimeMs: number,
  ttfbMs: number,
  redirectChain: string[],
  redirectStatuses: number[]
): CrawledPage {
  return {
    url,
    finalUrl,
    statusCode,
    html,
    headers,
    responseTimeMs,
    ttfbMs,
    contentLength: html ? Buffer.byteLength(html, "utf8") : 0,
    redirectChain,
    redirectStatuses,
    contentType: headers["content-type"] || "",
  };
}

/** Fetch XML/plain resources (sitemap, robots) with correct Accept header. */
export async function fetchTextResource(url: string): Promise<CrawledPage> {
  return fetchWithRedirects(url, {
    accept: "application/xml,text/xml,text/plain,*/*;q=0.8",
  });
}

export function isValidSitemapBody(body: string, contentType: string): boolean {
  if (!body.trim()) return false;
  if (contentType.includes("text/html")) return false;
  const trimmed = body.trim();
  return (
    trimmed.startsWith("<?xml") ||
    trimmed.includes("<urlset") ||
    trimmed.includes("<sitemapindex")
  );
}

export function isValidRobotsBody(body: string, contentType: string): boolean {
  if (!body.trim()) return false;
  if (contentType.includes("text/html")) return false;
  return /user-agent\s*:/i.test(body) || /disallow\s*:/i.test(body) || /allow\s*:/i.test(body) || /sitemap\s*:/i.test(body);
}

export async function headRequest(
  url: string
): Promise<{ statusCode: number; headers: Record<string, string>; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timeout);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { statusCode: response.status, headers, finalUrl: response.url };
  } catch {
    clearTimeout(timeout);
    return { statusCode: 0, headers: {}, finalUrl: url };
  }
}
