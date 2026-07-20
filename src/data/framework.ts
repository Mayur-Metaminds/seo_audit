import type { AuditCategory, FrameworkCheckpoint, Priority } from "@/types/audit.types";

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  crawlability: "Crawlability & Indexation",
  "on-page": "On-Page Technical Signals",
  architecture: "Technical Architecture",
  "page-speed": "Page Speed Metrics",
  assets: "Asset Optimisation",
  security: "Security & Server Hygiene",
  eeat: "E-E-A-T & Content Signals",
};

export const CATEGORY_MAX_SCORES: Record<AuditCategory, number> = {
  crawlability: 40,
  "on-page": 50,
  architecture: 45,
  "page-speed": 35,
  assets: 50,
  security: 30,
  eeat: 30,
};

export function getCategoryMaxScores(): Record<AuditCategory, number> {
  const derived = {} as Record<AuditCategory, number>;
  for (const cat of Object.keys(CATEGORY_LABELS) as AuditCategory[]) {
    derived[cat] = FRAMEWORK_CHECKPOINTS.filter((c) => c.category === cat).reduce((s, c) => s + c.maxScore, 0);
  }
  return derived;
}

export function getTotalMaxScore(): number {
  return FRAMEWORK_CHECKPOINTS.reduce((sum, c) => sum + c.maxScore, 0);
}

export const FRAMEWORK_CHECKPOINTS: FrameworkCheckpoint[] = [
  { id: 1, category: "crawlability", name: "robots.txt – syntax, disallow rules, sitemap pointer", description: "Validate robots.txt syntax, ensure no critical paths blocked, sitemap pointer present.", priority: "critical", tools: "Screaming Frog / GSC", maxScore: 5 },
  { id: 2, category: "crawlability", name: "XML Sitemap – present, accurate, submitted", description: "Sitemap exists, lists indexable URLs, includes lastmod, under 50k URLs.", priority: "critical", tools: "GSC / Sitebulb", maxScore: 5 },
  { id: 3, category: "crawlability", name: "Crawl budget – orphan pages, pagination waste", description: "Identify orphan pages and low-value URLs diluting crawl budget.", priority: "high", tools: "Log File Analyser", maxScore: 5 },
  { id: 4, category: "crawlability", name: "Canonical tags – self-referencing, no conflicts", description: "Every indexable page has exactly one self-referencing canonical.", priority: "critical", tools: "Screaming Frog", maxScore: 5 },
  { id: 5, category: "crawlability", name: "Redirect chains & loops – max 1 hop", description: "No redirect chains longer than 1 hop, no 302 for permanent moves.", priority: "critical", tools: "SF / Ahrefs", maxScore: 5 },
  { id: 6, category: "crawlability", name: "4xx / 5xx errors – zero broken internal links", description: "No broken internal links or server errors on crawled pages.", priority: "critical", tools: "GSC / SF", maxScore: 5 },
  { id: 7, category: "crawlability", name: "Noindex / nofollow misuse", description: "No valuable pages accidentally noindex'd.", priority: "critical", tools: "Screaming Frog", maxScore: 5 },
  { id: 8, category: "crawlability", name: "Hreflang implementation", description: "Correct lang codes, return tags, x-default for multilingual sites.", priority: "high", tools: "hreflang.org", maxScore: 5 },
  { id: 9, category: "on-page", name: "Title tags – unique, 50–60 chars", description: "Unique title tags, 50-60 characters, primary keyword front-loaded.", priority: "critical", tools: "Screaming Frog", maxScore: 5 },
  { id: 10, category: "on-page", name: "Meta descriptions – unique, 120–155 chars", description: "Unique meta descriptions with CTA, 120-155 characters.", priority: "high", tools: "Screaming Frog", maxScore: 5 },
  { id: 11, category: "on-page", name: "H1 tags – exactly one per page", description: "Each page has exactly one H1 matching search intent.", priority: "critical", tools: "Screaming Frog", maxScore: 5 },
  { id: 12, category: "on-page", name: "Heading hierarchy (H2–H6)", description: "Logical heading outline without skipped levels.", priority: "medium", tools: "SF / Manual", maxScore: 5 },
  { id: 13, category: "on-page", name: "Keyword prominence & content signals", description: "Target terms in first 100 words, meaningful content depth.", priority: "high", tools: "Surfer SEO", maxScore: 5 },
  { id: 14, category: "on-page", name: "Internal linking – 3–5 contextual links", description: "Adequate internal links per page, no orphan pages.", priority: "high", tools: "Ahrefs / Sitebulb", maxScore: 5 },
  { id: 15, category: "on-page", name: "Image alt text – descriptive", description: "All images have descriptive, relevant alt attributes.", priority: "medium", tools: "Screaming Frog", maxScore: 5 },
  { id: 16, category: "on-page", name: "Schema markup – JSON-LD validated", description: "Structured data present and valid for page type.", priority: "high", tools: "Rich Results Test", maxScore: 5 },
  { id: 17, category: "on-page", name: "Duplicate content signals", description: "No near-duplicate titles, meta, or thin content patterns.", priority: "high", tools: "Copyscape / SF", maxScore: 5 },
  { id: 18, category: "on-page", name: "URL structure – lowercase, hyphens", description: "Clean URLs: lowercase, hyphens, descriptive slugs.", priority: "medium", tools: "Screaming Frog", maxScore: 5 },
  { id: 19, category: "architecture", name: "HTTPS / SSL – valid cert, HSTS", description: "Site served over HTTPS with valid certificate, no mixed content.", priority: "critical", tools: "SSL Labs", maxScore: 5 },
  { id: 20, category: "architecture", name: "Mobile-friendliness – viewport meta", description: "Viewport meta tag present, responsive design signals.", priority: "critical", tools: "GSC / Lighthouse", maxScore: 5 },
  { id: 21, category: "architecture", name: "Core Web Vitals – LCP, INP, CLS", description: "LCP <2.5s, INP <200ms, CLS <0.1 (lab approximations).", priority: "critical", tools: "CrUX / PageSpeed", maxScore: 10 },
  { id: 22, category: "architecture", name: "JavaScript rendering – SSR content", description: "Critical content available in initial HTML response.", priority: "critical", tools: "Fetch as Googlebot", maxScore: 5 },
  { id: 23, category: "architecture", name: "Structured URL parameters", description: "No excessive parameter-based duplicate URLs.", priority: "high", tools: "GSC Parameters", maxScore: 5 },
  { id: 24, category: "architecture", name: "Pagination handling", description: "Paginated series use canonical correctly.", priority: "high", tools: "SF / Manual", maxScore: 5 },
  { id: 25, category: "architecture", name: "AMP / PWA signals", description: "If PWA/AMP used, valid and consistent with canonical.", priority: "medium", tools: "AMP Validator", maxScore: 5 },
  { id: 26, category: "architecture", name: "International targeting", description: "Hreflang and geo-targeting for international sites.", priority: "medium", tools: "GSC / Manual", maxScore: 5 },
  { id: 27, category: "page-speed", name: "Time to First Byte (TTFB) – ≤600ms", description: "Server response time within acceptable threshold.", priority: "critical", tools: "WebPageTest", maxScore: 5 },
  { id: 28, category: "page-speed", name: "First Contentful Paint (FCP) – ≤1.8s", description: "Fast initial paint, minimal render-blocking resources.", priority: "critical", tools: "Lighthouse", maxScore: 5 },
  { id: 29, category: "page-speed", name: "Largest Contentful Paint (LCP) – ≤2.5s", description: "LCP element loads quickly with preload/optimisation.", priority: "critical", tools: "PageSpeed Insights", maxScore: 5 },
  { id: 30, category: "page-speed", name: "Interaction to Next Paint (INP) – ≤200ms", description: "Low main-thread blocking, minimal long tasks.", priority: "critical", tools: "CrUX Dashboard", maxScore: 5 },
  { id: 31, category: "page-speed", name: "Cumulative Layout Shift (CLS) – ≤0.1", description: "Images/media have dimensions, no layout shift sources.", priority: "critical", tools: "Lighthouse / CrUX", maxScore: 5 },
  { id: 32, category: "page-speed", name: "Total Blocking Time (TBT) – ≤200ms", description: "Minimal JS blocking main thread.", priority: "high", tools: "Lighthouse", maxScore: 5 },
  { id: 33, category: "page-speed", name: "Speed Index – ≤3.4s", description: "Above-the-fold renders quickly.", priority: "high", tools: "WebPageTest", maxScore: 5 },
  { id: 34, category: "assets", name: "Image optimisation – WebP/AVIF, lazy load", description: "Modern formats, lazy loading below fold, LCP image eager.", priority: "critical", tools: "Squoosh / Lighthouse", maxScore: 5 },
  { id: 35, category: "assets", name: "CSS delivery – critical CSS", description: "Minimal render-blocking stylesheets.", priority: "high", tools: "Lighthouse", maxScore: 5 },
  { id: 36, category: "assets", name: "JavaScript bundle size", description: "Reasonable JS payload, code-split per route.", priority: "high", tools: "Bundle Analyzer", maxScore: 5 },
  { id: 37, category: "assets", name: "Third-party scripts impact", description: "Third-party scripts minimised and deferred.", priority: "high", tools: "WebPageTest 3P", maxScore: 5 },
  { id: 38, category: "assets", name: "Font loading – font-display:swap", description: "Custom fonts use font-display swap/preload.", priority: "high", tools: "Lighthouse", maxScore: 5 },
  { id: 39, category: "assets", name: "Resource hints – preconnect, preload", description: "Preconnect/preload for critical origins and LCP.", priority: "high", tools: "Manual / SF", maxScore: 5 },
  { id: 40, category: "assets", name: "Compression – Brotli or Gzip", description: "Text assets served with compression.", priority: "critical", tools: "WebPageTest", maxScore: 5 },
  { id: 41, category: "assets", name: "Browser caching – Cache-Control", description: "Static assets have long cache headers.", priority: "high", tools: "WebPageTest", maxScore: 5 },
  { id: 42, category: "assets", name: "HTTP/2 or HTTP/3 support", description: "Server supports modern HTTP protocol.", priority: "high", tools: "WebPageTest", maxScore: 5 },
  { id: 43, category: "assets", name: "CDN configuration", description: "Assets served from CDN edge where applicable.", priority: "high", tools: "Pingdom", maxScore: 5 },
  { id: 44, category: "security", name: "Security headers – CSP, HSTS, X-Frame", description: "Security headers properly configured.", priority: "high", tools: "Security Headers", maxScore: 5 },
  { id: 45, category: "security", name: "Leaked sensitive files", description: "No .env, wp-config, phpinfo accessible.", priority: "critical", tools: "Manual / Burp", maxScore: 5 },
  { id: 46, category: "security", name: "Soft 404 responses", description: "Missing pages return true 404, not 200.", priority: "high", tools: "GSC / SF", maxScore: 5 },
  { id: 47, category: "security", name: "Server-side redirects only", description: "No client-side JS redirects for SEO paths.", priority: "high", tools: "SF / Log Files", maxScore: 5 },
  { id: 48, category: "security", name: "GSC coverage health", description: "Google Search Console indexation health.", priority: "critical", tools: "GSC", maxScore: 5 },
  { id: 49, category: "security", name: "Bing Webmaster Tools", description: "Bing WMT configured and sitemap submitted.", priority: "medium", tools: "Bing WMT", maxScore: 5 },
  { id: 50, category: "eeat", name: "Author & About pages", description: "Author bios, credentials, about page present.", priority: "high", tools: "Manual", maxScore: 5 },
  { id: 51, category: "eeat", name: "Content freshness signals", description: "Last-modified dates, updated content indicators.", priority: "high", tools: "SF / Manual", maxScore: 5 },
  { id: 52, category: "eeat", name: "Outbound links – authoritative sources", description: "Cites authoritative sources, no broken outbound links.", priority: "medium", tools: "Screaming Frog", maxScore: 5 },
  { id: 53, category: "eeat", name: "Breadcrumb navigation", description: "Breadcrumbs present with BreadcrumbList schema.", priority: "medium", tools: "SF / Rich Results", maxScore: 5 },
  { id: 54, category: "eeat", name: "404 & error page UX", description: "Custom 404 with navigation, returns 404 status.", priority: "medium", tools: "Manual", maxScore: 5 },
  { id: 55, category: "eeat", name: "Core vitals UX signals", description: "No intrusive interstitials, accessible navigation.", priority: "high", tools: "Lighthouse", maxScore: 5 },
];

export function getCheckpoint(id: number): FrameworkCheckpoint | undefined {
  return FRAMEWORK_CHECKPOINTS.find((c) => c.id === id);
}

export function getGrade(percentage: number): "elite" | "good" | "needs-work" | "critical" {
  if (percentage >= 90) return "elite";
  if (percentage >= 70) return "good";
  if (percentage >= 50) return "needs-work";
  return "critical";
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-slate-600 bg-slate-50 border-slate-200",
};

export const STATUS_COLORS: Record<string, string> = {
  pass: "text-emerald-700 bg-emerald-50 border-emerald-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  fail: "text-red-700 bg-red-50 border-red-200",
  na: "text-slate-500 bg-slate-50 border-slate-200",
  manual: "text-blue-700 bg-blue-50 border-blue-200",
};
