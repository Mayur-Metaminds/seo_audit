/**
 * Page limit for crawls.
 * - Custom server (default): unlimited — set nothing, or AUDIT_MAX_PAGES=0 / unlimited
 * - Vercel: set AUDIT_MAX_PAGES=150 (or similar) so the function finishes within maxDuration
 */
export function resolveMaxPages(requested?: number): number {
  if (requested !== undefined && requested !== null) {
    if (requested <= 0) return Number.POSITIVE_INFINITY;
    return Math.floor(requested);
  }

  const raw = process.env.AUDIT_MAX_PAGES?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "unlimited" || raw === "infinity") {
    return Number.POSITIVE_INFINITY;
  }

  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return Number.POSITIVE_INFINITY;
}

export function isUnlimitedPages(maxPages: number): boolean {
  return !Number.isFinite(maxPages) || maxPages >= Number.MAX_SAFE_INTEGER;
}
