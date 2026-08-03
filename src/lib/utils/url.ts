export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    const isLocalhost =
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(\/|:|$)/i.test(url) ||
      /\.(local|internal)(\/|:|$)/i.test(url);
    url = isLocalhost ? `http://${url}` : `https://${url}`;
  }
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

/** Compare preferred URLs for SEO (www vs bare host treated as same). */
export function urlsEquivalent(a: string, b: string): boolean {
  try {
    const na = new URL(normalizeUrl(a));
    const nb = new URL(normalizeUrl(b));
    const hostA = na.hostname.replace(/^www\./i, "").toLowerCase();
    const hostB = nb.hostname.replace(/^www\./i, "").toLowerCase();
    const pathA = na.pathname === "/" ? "/" : na.pathname.replace(/\/$/, "");
    const pathB = nb.pathname === "/" ? "/" : nb.pathname.replace(/\/$/, "");
    return hostA === hostB && pathA === pathB && na.search === nb.search;
  } catch {
    try {
      return normalizeUrl(a) === normalizeUrl(b);
    } catch {
      return a === b;
    }
  }
}

export function getDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

export function isSameDomain(url: string, baseUrl: string): boolean {
  try {
    return getDomain(url) === getDomain(baseUrl);
  } catch {
    return false;
  }
}

export function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:") || href.startsWith("#")) {
      return null;
    }
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

export function isIndexableUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const blockedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".css", ".js", ".zip"];
  return !blockedExtensions.some((ext) => lower.endsWith(ext));
}

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function urlsMatch(a: string, b: string): boolean {
  try {
    return normalizeUrl(a) === normalizeUrl(b);
  } catch {
    return a === b;
  }
}
