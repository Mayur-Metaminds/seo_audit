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
  {
    id: 1,
    category: "crawlability",
    name: "robots.txt – syntax, disallow rules, sitemap pointer",
    description: "Validate robots.txt syntax, ensure no critical paths blocked, sitemap pointer present.",
    priority: "critical",
    tools: "Screaming Frog / GSC",
    maxScore: 5,
    codeLocation: "public/robots.txt (or server web root)",
    issueCode: `# Missing robots.txt or blocking all crawlers
User-agent: *
Disallow: /`,
    suggestion: "Create or update public/robots.txt to allow search crawlers access to indexable pages and include your XML sitemap URL.",
    solutionCode: `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: https://yourdomain.com/sitemap.xml`,
  },
  {
    id: 2,
    category: "crawlability",
    name: "XML Sitemap – present, accurate, submitted",
    description: "Sitemap exists, lists indexable URLs, includes lastmod, under 50k URLs.",
    priority: "critical",
    tools: "GSC / Sitebulb",
    maxScore: 5,
    codeLocation: "public/sitemap.xml or src/app/sitemap.ts (Next.js)",
    issueCode: `<!-- XML Sitemap missing or invalid -->
HTTP/1.1 404 Not Found
GET /sitemap.xml -> 404`,
    suggestion: "Generate an XML sitemap listing all indexable URLs with lastmod timestamps and submit it to Search Console.",
    solutionCode: `import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://yourdomain.com', lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: 'https://yourdomain.com/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  ];
}`,
  },
  {
    id: 3,
    category: "crawlability",
    name: "Crawl budget – orphan pages, pagination waste",
    description: "Identify orphan pages and low-value URLs diluting crawl budget.",
    priority: "high",
    tools: "Log File Analyser",
    maxScore: 5,
    codeLocation: "public/robots.txt & navigation link components",
    issueCode: `<!-- Crawlers wasting budget on dynamic filters -->
https://yourdomain.com/products?sort=price_asc&filter=red&page=99`,
    suggestion: "Disallow crawl budget wasters like internal search parameters and sorting routes in robots.txt.",
    solutionCode: `User-agent: *
Disallow: /*?sort=
Disallow: /*?filter=
Disallow: /search/`,
  },
  {
    id: 4,
    category: "crawlability",
    name: "Canonical tags – self-referencing, no conflicts",
    description: "Every indexable page has exactly one self-referencing canonical.",
    priority: "critical",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "<head> tag in index.html or layout.tsx / page.tsx metadata",
    issueCode: `<!-- Missing canonical tag in <head> -->
<head>
  <title>Page Title</title>
  <!-- <link rel="canonical"> tag absent -->
</head>`,
    suggestion: "Add a self-referencing absolute canonical link tag in the <head> of every indexable page.",
    solutionCode: `<!-- HTML -->
<link rel="canonical" href="https://yourdomain.com/current-page" />

// Next.js App Router (metadata)
export const metadata = {
  alternates: {
    canonical: 'https://yourdomain.com/current-page',
  },
};`,
  },
  {
    id: 5,
    category: "crawlability",
    name: "Redirect chains & loops – max 1 hop",
    description: "No redirect chains longer than 1 hop, no 302 for permanent moves.",
    priority: "critical",
    tools: "SF / Ahrefs",
    maxScore: 5,
    codeLocation: "server configuration / next.config.js / middleware",
    issueCode: `<!-- Multi-hop redirect chain -->
http://example.com/old 
 -> 302 http://example.com/mid 
  -> 302 https://example.com/new`,
    suggestion: "Collapse multi-step redirect chains into a single direct 301 HTTP redirect.",
    solutionCode: `// next.config.js
module.exports = {
  async redirects() {
    return [
      {
        source: '/old-path',
        destination: '/new-path',
        permanent: true, // 301 Redirect
      },
    ];
  },
};`,
  },
  {
    id: 6,
    category: "crawlability",
    name: "4xx / 5xx errors – zero broken internal links",
    description: "No broken internal links or server errors on crawled pages.",
    priority: "critical",
    tools: "GSC / SF",
    maxScore: 5,
    codeLocation: "navigation components / template <a> tags",
    issueCode: `<!-- Broken internal link returning 404 -->
<a href="/deleted-page-link">Broken Link</a> <!-- Target URL returns HTTP 404 -->`,
    suggestion: "Update or remove all internal <a href> links pointing to 404 or 500 status URLs.",
    solutionCode: `<!-- Ensure all links target live valid routes -->
<a href="/products" className="nav-link">Products</a>

// Next.js Link component
import Link from 'next/link';
<Link href="/contact">Contact Us</Link>`,
  },
  {
    id: 7,
    category: "crawlability",
    name: "Noindex / nofollow misuse",
    description: "No valuable pages accidentally noindex'd.",
    priority: "critical",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "<head> -> <meta name=\"robots\"> or X-Robots-Tag header",
    issueCode: `<!-- Accidental noindex on public page -->
<meta name="robots" content="noindex, nofollow" />`,
    suggestion: "Remove noindex directives from pages intended to rank in search results.",
    solutionCode: `<!-- HTML -->
<meta name="robots" content="index, follow" />

// Next.js metadata
export const metadata = {
  robots: { index: true, follow: true },
};`,
  },
  {
    id: 8,
    category: "crawlability",
    name: "Hreflang implementation",
    description: "Correct lang codes, return tags, x-default for multilingual sites.",
    priority: "high",
    tools: "hreflang.org",
    maxScore: 5,
    codeLocation: "<head> section in layout / page head template",
    issueCode: `<!-- Missing return hreflang or missing x-default -->
<link rel="alternate" hreflang="es" href="https://example.com/es/" />
<!-- missing x-default and reciprocal tags -->`,
    suggestion: "Add reciprocal hreflang tags for all localized page versions along with x-default fallback.",
    solutionCode: `<link rel="alternate" hreflang="en" href="https://example.com/en/page" />
<link rel="alternate" hreflang="es" href="https://example.com/es/page" />
<link rel="alternate" hreflang="x-default" href="https://example.com/en/page" />`,
  },
  {
    id: 9,
    category: "on-page",
    name: "Title tags – unique, 50–60 chars",
    description: "Unique title tags, 50-60 characters, primary keyword front-loaded.",
    priority: "critical",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "<head> -> <title> tag or Next.js metadata.title",
    issueCode: `<!-- Missing, non-descriptive, or too short title -->
<title>Home</title>`,
    suggestion: "Add a concise, unique 50–60 character title tag containing primary keywords.",
    solutionCode: `<!-- HTML -->
<title>SEO Audit Tool & Website Checker | Brand Name</title>

// Next.js metadata
export const metadata = {
  title: 'SEO Audit Tool & Website Checker | Brand Name',
};`,
  },
  {
    id: 10,
    category: "on-page",
    name: "Meta descriptions – unique, 120–155 chars",
    description: "Unique meta descriptions with CTA, 120-155 characters.",
    priority: "high",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "<head> -> <meta name=\"description\"> or Next.js metadata.description",
    issueCode: `<!-- Missing meta description tag in head -->
<head>
  <title>Page Title</title>
  <!-- <meta name="description"> is absent -->
</head>`,
    suggestion: "Provide a unique 120–155 character meta description summarizing content with a call to action.",
    solutionCode: `<!-- HTML -->
<meta name="description" content="Perform an instant technical SEO audit for your site. Discover critical issues and step-by-step code solutions now." />

// Next.js metadata
export const metadata = {
  description: 'Perform an instant technical SEO audit for your site. Discover critical issues and step-by-step code solutions now.',
};`,
  },
  {
    id: 11,
    category: "on-page",
    name: "H1 tags – exactly one per page",
    description: "Each page has exactly one H1 matching search intent.",
    priority: "critical",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "<main> content section in page component / template",
    issueCode: `<!-- Example: missing H1 OR multiple H1s on a content page -->
<main>
  <div class="title">Why Successful People Often Wear Black</div>
  <h1>Where This Remedy Comes From</h1>
  <h1>What to Avoid</h1>
</main>`,
    suggestion:
      "Ensure there is exactly one visible <h1> per page near the top of main content. Convert extra section titles to <h2>/<h3>. Prefer a real heading over an sr-only H1 + decorative <div>.",
    solutionCode: `<main>
  <h1>Why Successful People Often Wear Black</h1>
  <h2>Where This Remedy Comes From</h2>
  <h2>What to Avoid</h2>
</main>`,
  },
  {
    id: 12,
    category: "on-page",
    name: "Heading hierarchy (H2–H6)",
    description: "Logical heading outline without skipped levels.",
    priority: "medium",
    tools: "SF / Manual",
    maxScore: 5,
    codeLocation: "body text components (src/components/Section.tsx)",
    issueCode: `<!-- Heading level skipped (H1 to H4 directly) -->
<h1>Main Title</h1>
<h4>Sub Topic (Skipped H2 and H3)</h4>`,
    suggestion: "Structure subheadings sequentially from h2 to h3 without skipping heading levels.",
    solutionCode: `<h1>Main Topic</h1>
<h2>Section Topic</h2>
<h3>Sub-point Detail</h3>`,
  },
  {
    id: 13,
    category: "on-page",
    name: "Keyword prominence & content signals",
    description: "Target terms in first 100 words, meaningful content depth.",
    priority: "high",
    tools: "Surfer SEO",
    maxScore: 5,
    codeLocation: "hero paragraph & introduction section",
    issueCode: `<!-- Thin content / keywords missing from lead text -->
<section>
  <p>Click here to learn more about stuff.</p>
</section>`,
    suggestion: "Include primary search keywords within the first 100 words of page content.",
    solutionCode: `<section className="hero">
  <h1>Comprehensive SEO Checker</h1>
  <p>Our SEO checker analyzes your web pages for crawlability, performance, and on-page signals...</p>
</section>`,
  },
  {
    id: 14,
    category: "on-page",
    name: "Internal linking – 3–5 contextual links",
    description: "Adequate internal links per page, no orphan pages.",
    priority: "high",
    tools: "Ahrefs / Sitebulb",
    maxScore: 5,
    codeLocation: "article body & page copy components",
    issueCode: `<!-- Zero internal contextual links in content body -->
<p>This page discusses website optimization and speed.</p>`,
    suggestion: "Add 3-5 contextual internal links with descriptive anchor text to related topic pages.",
    solutionCode: `<p>
  Learn more about our <a href="/seo-guide">technical SEO best practices</a> to boost search performance.
</p>`,
  },
  {
    id: 15,
    category: "on-page",
    name: "Image alt text – descriptive",
    description: "All images have descriptive, relevant alt attributes.",
    priority: "medium",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "<img> tags or Next.js <Image> component",
    issueCode: `<!-- Missing alt attribute on image element -->
<img src="/dashboard.png" />
<img src="/hero.jpg" alt="" /> <!-- empty alt on informative image -->`,
    suggestion: "Add concise descriptive alt attributes to all informative images.",
    solutionCode: `<!-- Standard HTML -->
<img src="/dashboard.png" alt="SEO Audit Dashboard displaying site health score" />

<!-- Next.js Image -->
<Image src="/hero.jpg" alt="Developer reviewing code fixes" width={800} height={400} />`,
  },
  {
    id: 16,
    category: "on-page",
    name: "Schema markup – JSON-LD validated",
    description: "Structured data present and valid for page type.",
    priority: "high",
    tools: "Rich Results Test",
    maxScore: 5,
    codeLocation: "<head> or <body> script block tag",
    issueCode: `<!-- Missing JSON-LD structured data block -->
<head>
  <title>Page Title</title>
  <!-- No <script type="application/ld+json"> tag -->
</head>`,
    suggestion: "Embed valid JSON-LD schema markup matching page type (WebSite, Article, Product, Organization).",
    solutionCode: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "SEO Checker",
  "url": "https://yourdomain.com"
}
</script>`,
  },
  {
    id: 17,
    category: "on-page",
    name: "Duplicate content signals",
    description: "No near-duplicate titles, meta, or thin content patterns.",
    priority: "high",
    tools: "Copyscape / SF",
    maxScore: 5,
    codeLocation: "route metadata generators & template logic",
    issueCode: `<!-- Hardcoded identical title across all dynamic pages -->
export const metadata = {
  title: 'My Online Store', // Same for all products
};`,
    suggestion: "Ensure each page generates distinct title/meta text and unique content.",
    solutionCode: `export async function generateMetadata({ params }) {
  const item = await getItem(params.id);
  return {
    title: \`\${item.title} | Brand Store\`,
    description: item.summary,
  };
}`,
  },
  {
    id: 18,
    category: "on-page",
    name: "URL structure – lowercase, hyphens",
    description: "Clean URLs: lowercase, hyphens, descriptive slugs.",
    priority: "medium",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "router path definitions & slug generator functions",
    issueCode: `<!-- Messy URL with spaces, uppercase, and underscores -->
https://yourdomain.com/Products_Page/ITEM%20123_Details.html`,
    suggestion: "Use lowercase letters, numbers, and hyphens for clean, human-readable URL slugs.",
    solutionCode: `function toSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9 -]/g, '').replace(/\\s+/g, '-');
}`,
  },
  {
    id: 19,
    category: "architecture",
    name: "HTTPS / SSL – valid cert, HSTS",
    description: "Site served over HTTPS with valid certificate, no mixed content.",
    priority: "critical",
    tools: "SSL Labs",
    maxScore: 5,
    codeLocation: "web server config (nginx.conf / Apache / Cloudflare)",
    issueCode: `# Insecure HTTP connection allowed
http://example.com/ (Port 80 HTTP 200 OK)
# Missing HTTP to HTTPS redirect`,
    suggestion: "Enforce HTTPS server redirects and return the HTTP Strict-Transport-Security header.",
    solutionCode: `# Nginx SSL & HSTS config
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`,
  },
  {
    id: 20,
    category: "architecture",
    name: "Mobile-friendliness – viewport meta",
    description: "Viewport meta tag present, responsive design signals.",
    priority: "critical",
    tools: "GSC / Lighthouse",
    maxScore: 5,
    codeLocation: "<head> tag in layout.tsx / index.html",
    issueCode: `<!-- Missing viewport meta tag in head -->
<head>
  <title>Desktop Layout</title>
  <!-- <meta name="viewport"> absent -->
</head>`,
    suggestion: "Add standard responsive viewport meta tag inside the <head> element.",
    solutionCode: `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
  },
  {
    id: 21,
    category: "architecture",
    name: "Core Web Vitals – LCP, INP, CLS",
    description: "LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 — measured via Google PSI (CrUX field + Lighthouse lab).",
    priority: "critical",
    tools: "PageSpeed Insights / CrUX / Lighthouse",
    maxScore: 10,
    codeLocation: "frontend layout, images, and font declarations",
    issueCode: `<!-- Layout shift source: missing width/height & un-preloaded hero -->
<img src="/hero.png" /> <!-- Causes layout shift (CLS) & delayed LCP -->`,
    suggestion: "Preload critical LCP hero assets, set explicit image width/height for CLS, and minimize main thread blocking.",
    solutionCode: `<link rel="preload" as="image" href="/hero.webp" fetchpriority="high" />

<div style={{ aspectRatio: '16/9' }}>
  <img src="/hero.webp" width="1200" height="675" alt="Hero" />
</div>`,
  },
  {
    id: 22,
    category: "architecture",
    name: "JavaScript rendering – SSR content",
    description: "Critical content available in initial HTML response.",
    priority: "critical",
    tools: "Fetch as Googlebot",
    maxScore: 5,
    codeLocation: "Next.js page components (server side rendering)",
    issueCode: `<!-- Empty initial HTML body (client-only rendering) -->
<div id="root"></div> <!-- Crawlers receive blank page without JS execution -->`,
    suggestion: "Render key body text and metadata on the server so crawlers receive complete HTML.",
    solutionCode: `// Next.js Server Component (SSR)
export default async function Page() {
  const data = await fetchData();
  return (
    <main>
      <h1>{data.title}</h1>
      <p>{data.description}</p>
    </main>
  );
}`,
  },
  {
    id: 23,
    category: "architecture",
    name: "Structured URL parameters",
    description: "No excessive parameter-based duplicate URLs.",
    priority: "high",
    tools: "GSC Parameters",
    maxScore: 5,
    codeLocation: "<head> -> canonical tag & router query handlers",
    issueCode: `<!-- Duplicate content created by raw query parameters -->
https://yourdomain.com/products?session_id=987234&tracking=abc`,
    suggestion: "Canonicalize dynamic parameter URLs back to the clean base URL.",
    solutionCode: `<link rel="canonical" href="https://yourdomain.com/products" />`,
  },
  {
    id: 24,
    category: "architecture",
    name: "Pagination handling",
    description: "Paginated series use canonical correctly.",
    priority: "high",
    tools: "SF / Manual",
    maxScore: 5,
    codeLocation: "<head> canonical tag in paginated pages",
    issueCode: `<!-- Paginated page canonical pointing incorrectly to root page 1 -->
<!-- URL: https://yourdomain.com/blog?page=3 -->
<link rel="canonical" href="https://yourdomain.com/blog" /> <!-- Wrong! -->`,
    suggestion: "Ensure paginated pages use self-referencing canonical tags (e.g. ?page=2).",
    solutionCode: `<link rel="canonical" href="https://yourdomain.com/blog?page=2" />`,
  },
  {
    id: 25,
    category: "architecture",
    name: "AMP / PWA signals",
    description: "If PWA/AMP used, valid and consistent with canonical.",
    priority: "medium",
    tools: "AMP Validator",
    maxScore: 5,
    codeLocation: "<head> -> <link rel=\"manifest\"> and public/manifest.json",
    issueCode: `<!-- PWA features enabled but manifest tag missing -->
<head>
  <!-- <link rel="manifest"> absent -->
</head>`,
    suggestion: "Ensure PWA web app manifest is linked in <head> if web application features are enabled.",
    solutionCode: `<link rel="manifest" href="/manifest.json" />`,
  },
  {
    id: 26,
    category: "architecture",
    name: "International targeting",
    description: "Hreflang and geo-targeting for international sites.",
    priority: "medium",
    tools: "GSC / Manual",
    maxScore: 5,
    codeLocation: "<head> section & server language header configuration",
    issueCode: `<!-- Multi-language site missing regional targeting tags -->
<!-- No hreflang annotations in head -->`,
    suggestion: "Annotate regional pages with corresponding hreflang links.",
    solutionCode: `<link rel="alternate" hreflang="en-us" href="https://example.com/us/" />
<link rel="alternate" hreflang="en-gb" href="https://example.com/uk/" />`,
  },
  {
    id: 27,
    category: "page-speed",
    name: "Time to First Byte (TTFB) – ≤600ms",
    description: "Server response time within acceptable threshold.",
    priority: "critical",
    tools: "WebPageTest",
    maxScore: 5,
    codeLocation: "server routes / DB queries / CDN caching headers",
    issueCode: `<!-- Slow server response (TTFB > 1200ms) -->
HTTP/1.1 200 OK
Time-To-First-Byte: 1256ms (Server database blocking)`,
    suggestion: "Enable CDN caching headers and optimize server side database queries.",
    solutionCode: `// Set cache control response header in Next.js
export const revalidate = 3600; // Cache page for 1 hour`,
  },
  {
    id: 28,
    category: "page-speed",
    name: "First Contentful Paint (FCP) – ≤1.8s",
    description: "Fast initial paint, minimal render-blocking resources.",
    priority: "critical",
    tools: "Lighthouse",
    maxScore: 5,
    codeLocation: "<head> stylesheet & script tags",
    issueCode: `<!-- Heavy render-blocking scripts in head -->
<script src="/huge-library.js"></script> <!-- blocks FCP rendering -->`,
    suggestion: "Defer non-critical scripts and preload critical font assets.",
    solutionCode: `<script src="/app.js" defer></script>
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin />`,
  },
  {
    id: 29,
    category: "page-speed",
    name: "Largest Contentful Paint (LCP) – ≤2.5s",
    description: "LCP element loads quickly with preload/optimisation.",
    priority: "critical",
    tools: "PageSpeed Insights",
    maxScore: 5,
    codeLocation: "LCP hero image tag & <head> preloads",
    issueCode: `<!-- Lazy loading LCP image (causes slow paint) -->
<img src="/hero.jpg" loading="lazy" /> <!-- Don't lazy load LCP image! -->`,
    suggestion: "Preload your LCP hero image and use loading=\"eager\" with fetchpriority=\"high\".",
    solutionCode: `<link rel="preload" href="/hero.webp" as="image" fetchpriority="high" />
<img src="/hero.webp" loading="eager" fetchpriority="high" alt="Hero Banner" />`,
  },
  {
    id: 30,
    category: "page-speed",
    name: "Interaction to Next Paint (INP) – ≤200ms",
    description: "Low main-thread blocking, minimal long tasks.",
    priority: "critical",
    tools: "CrUX Dashboard",
    maxScore: 5,
    codeLocation: "client click & input handler functions",
    issueCode: `<!-- Synchronous heavy long task blocking main UI thread -->
button.addEventListener('click', () => {
  runHeavyCalculationSync(); // blocks main thread > 300ms
});`,
    suggestion: "Defer non-urgent computations out of main thread event handlers.",
    solutionCode: `function handleClick() {
  setTimeout(() => {
    runHeavyComputation();
  }, 0);
}`,
  },
  {
    id: 31,
    category: "page-speed",
    name: "Cumulative Layout Shift (CLS) – ≤0.1",
    description: "Images/media have dimensions, no layout shift sources.",
    priority: "critical",
    tools: "Lighthouse / CrUX",
    maxScore: 5,
    codeLocation: "<img>, <iframe>, and dynamic banner containers",
    issueCode: `<!-- Missing dimensions causing cumulative layout shift -->
<img src="/banner.webp" /> <!-- No width or height specified -->`,
    suggestion: "Set explicit width/height or aspect-ratio on image and banner containers.",
    solutionCode: `<img src="/banner.webp" width="1200" height="630" alt="Banner" style={{ aspectRatio: '1200/630' }} />`,
  },
  {
    id: 32,
    category: "page-speed",
    name: "Total Blocking Time (TBT) – ≤200ms",
    description: "Minimal JS blocking main thread.",
    priority: "high",
    tools: "Lighthouse",
    maxScore: 5,
    codeLocation: "bundle imports & analytics script tags",
    issueCode: `<!-- Multiple blocking third-party scripts -->
<script src="https://example.com/tracker1.js"></script>
<script src="https://example.com/tracker2.js"></script>`,
    suggestion: "De-prioritize heavy third-party scripts with async or defer attributes.",
    solutionCode: `<script src="https://example.com/analytics.js" async defer></script>`,
  },
  {
    id: 33,
    category: "page-speed",
    name: "Speed Index – ≤3.4s",
    description: "Above-the-fold renders quickly.",
    priority: "high",
    tools: "WebPageTest",
    maxScore: 5,
    codeLocation: "above-the-fold layout styles & critical CSS",
    issueCode: `<!-- Un-styled initial flash of content (FOUC) -->
<!-- External CSS loading late in document footer -->`,
    suggestion: "Inline critical CSS needed for above-the-fold content rendering.",
    solutionCode: `<style>
  .hero-container { display: flex; min-height: 400px; }
</style>`,
  },
  {
    id: 34,
    category: "assets",
    name: "Image optimisation – WebP/AVIF, lazy load",
    description: "Modern formats, lazy loading below fold, LCP image eager.",
    priority: "critical",
    tools: "Squoosh / Lighthouse",
    maxScore: 5,
    codeLocation: "<img> tags & Next.js <Image> component",
    issueCode: `<!-- Large uncompressed PNG image without lazy loading -->
<img src="/photo.png" size="4.2MB" />`,
    suggestion: "Convert image files to WebP or AVIF and apply loading=\"lazy\" to below-fold media.",
    solutionCode: `<img src="/photo.webp" loading="lazy" width="600" height="400" alt="Optimized illustration" />`,
  },
  {
    id: 35,
    category: "assets",
    name: "CSS delivery – critical CSS",
    description: "Minimal render-blocking stylesheets.",
    priority: "high",
    tools: "Lighthouse",
    maxScore: 5,
    codeLocation: "<head> -> <link rel=\"stylesheet\">",
    issueCode: `<!-- Un-minified heavy stylesheet in head -->
<link rel="stylesheet" href="/full-framework-all-styles.css" />`,
    suggestion: "Purge unused CSS and load non-critical stylesheets asynchronously.",
    solutionCode: `<link rel="stylesheet" href="/non-critical.css" media="print" onload="this.media='all'" />`,
  },
  {
    id: 36,
    category: "assets",
    name: "JavaScript bundle size",
    description: "Reasonable JS payload, code-split per route.",
    priority: "high",
    tools: "Bundle Analyzer",
    maxScore: 5,
    codeLocation: "route imports & component declarations",
    issueCode: `<!-- Monolithic entry bundle importing unused modules -->
import { Everything } from 'huge-library';`,
    suggestion: "Use code splitting and dynamic imports for heavy components.",
    solutionCode: `import dynamic from 'next/dynamic';
const HeavyChart = dynamic(() => import('@/components/HeavyChart'), { ssr: false });`,
  },
  {
    id: 37,
    category: "assets",
    name: "Third-party scripts impact",
    description: "Third-party scripts minimised and deferred.",
    priority: "high",
    tools: "WebPageTest 3P",
    maxScore: 5,
    codeLocation: "analytics & marketing script insertions",
    issueCode: `<!-- Synchronous third-party widget loading on entry -->
<script src="https://chat-widget.com/widget.js"></script>`,
    suggestion: "Load third-party scripts with lazy loading strategies.",
    solutionCode: `import Script from 'next/script';
<Script src="https://www.googletagmanager.com/gtag/js" strategy="lazyOnload" />`,
  },
  {
    id: 38,
    category: "assets",
    name: "Font loading – font-display:swap",
    description: "Custom fonts use font-display swap/preload.",
    priority: "high",
    tools: "Lighthouse",
    maxScore: 5,
    codeLocation: "@font-face CSS rules or next/font import",
    issueCode: `<!-- Missing font-display property (causes FOIT invisible text) -->
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2');
  /* font-display missing */
}`,
    suggestion: "Use font-display: swap in CSS or enable font preloading.",
    solutionCode: `@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap;
}`,
  },
  {
    id: 39,
    category: "assets",
    name: "Resource hints – preconnect, preload",
    description: "Preconnect/preload for critical origins and LCP.",
    priority: "high",
    tools: "Manual / SF",
    maxScore: 5,
    codeLocation: "<head> tag in layout.tsx / index.html",
    issueCode: `<!-- Third party font domain without preconnect connection -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto" />`,
    suggestion: "Add preconnect hints for third-party origins like font servers and CDNs.",
    solutionCode: `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
  },
  {
    id: 40,
    category: "assets",
    name: "Compression – Brotli or Gzip",
    description: "Text assets served with compression.",
    priority: "critical",
    tools: "WebPageTest",
    maxScore: 5,
    codeLocation: "web server config (nginx.conf / Apache .htaccess)",
    issueCode: `# Server response without compression header
HTTP/1.1 200 OK
Content-Type: text/html
# Content-Encoding gzip/br missing`,
    suggestion: "Enable Brotli or Gzip compression for text responses (HTML, CSS, JS).",
    solutionCode: `# Nginx Gzip configuration
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml;`,
  },
  {
    id: 41,
    category: "assets",
    name: "Browser caching – Cache-Control",
    description: "Static assets have long cache headers.",
    priority: "high",
    tools: "WebPageTest",
    maxScore: 5,
    codeLocation: "server response headers / CDN cache policy",
    issueCode: `# Missing long-term caching header on static assets
HTTP/1.1 200 OK
Cache-Control: no-cache, no-store`,
    suggestion: "Set Cache-Control max-age to 1 year (31536000s) for versioned static assets.",
    solutionCode: `location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2)$ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}`,
  },
  {
    id: 42,
    category: "assets",
    name: "HTTP/2 or HTTP/3 support",
    description: "Server supports modern HTTP protocol.",
    priority: "high",
    tools: "WebPageTest",
    maxScore: 5,
    codeLocation: "web server SSL listen configuration",
    issueCode: `# Server using old HTTP/1.1 protocol
GET /app.js HTTP/1.1`,
    suggestion: "Enable HTTP/2 or HTTP/3 support on web server or CDN proxy.",
    solutionCode: `server {
  listen 443 ssl http2;
  server_name example.com;
}`,
  },
  {
    id: 43,
    category: "assets",
    name: "CDN configuration",
    description: "Assets served from CDN edge where applicable.",
    priority: "high",
    tools: "Pingdom",
    maxScore: 5,
    codeLocation: "DNS configuration / reverse proxy",
    issueCode: `<!-- Assets served directly from origin server -->
https://origin-server-direct.yourdomain.com/logo.png`,
    suggestion: "Route asset requests through Cloudflare, Vercel, or AWS CloudFront edge servers.",
    solutionCode: `static.yourdomain.com CNAME cdn.provider.net`,
  },
  {
    id: 44,
    category: "security",
    name: "Security headers – CSP, HSTS, X-Frame",
    description: "Security headers properly configured.",
    priority: "high",
    tools: "Security Headers",
    maxScore: 5,
    codeLocation: "next.config.js / nginx response headers",
    issueCode: `# Response missing security headers
HTTP/1.1 200 OK
# X-Frame-Options & X-Content-Type-Options missing`,
    suggestion: "Configure security headers: X-Frame-Options, X-Content-Type-Options, HSTS.",
    solutionCode: `module.exports = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }];
  },
};`,
  },
  {
    id: 45,
    category: "security",
    name: "Leaked sensitive files",
    description: "No .env, wp-config, phpinfo accessible.",
    priority: "critical",
    tools: "Manual / Burp",
    maxScore: 5,
    codeLocation: "public directory & .gitignore file",
    issueCode: `<!-- Environment variable file exposed in public web root -->
GET /https://yourdomain.com/.env -> HTTP 200 OK`,
    suggestion: "Ensure configuration files (.env, git metadata) are outside web root and listed in .gitignore.",
    solutionCode: `# .gitignore
.env
.env.local
*.pem
*.key`,
  },
  {
    id: 46,
    category: "security",
    name: "Soft 404 responses",
    description: "Missing pages return true 404, not 200.",
    priority: "high",
    tools: "GSC / SF",
    maxScore: 5,
    codeLocation: "not-found route handler (src/app/not-found.tsx)",
    issueCode: `<!-- Soft 404: Non-existent page returns HTTP 200 status -->
GET /non-existent-page -> HTTP/1.1 200 OK`,
    suggestion: "Ensure non-existent pages respond with actual HTTP 404 status codes.",
    solutionCode: `import { notFound } from 'next/navigation';

export default function Page({ data }) {
  if (!data) notFound();
  return <div>Content</div>;
}`,
  },
  {
    id: 47,
    category: "security",
    name: "Server-side redirects only",
    description: "No client-side JS redirects for SEO paths.",
    priority: "high",
    tools: "SF / Log Files",
    maxScore: 5,
    codeLocation: "middleware / route redirects",
    issueCode: `<!-- Client-side JavaScript redirect -->
<script>
  window.location.href = "/new-url"; // Bad for SEO crawlers!
</script>`,
    suggestion: "Perform HTTP 301 redirects on the server level rather than client side JavaScript.",
    solutionCode: `import { NextResponse } from 'next/server';

export function middleware(request) {
  return NextResponse.redirect(new URL('/new-url', request.url), 301);
}`,
  },
  {
    id: 48,
    category: "security",
    name: "GSC coverage health",
    description: "Google Search Console indexation health.",
    priority: "critical",
    tools: "GSC",
    maxScore: 5,
    codeLocation: "GSC portal & robots.txt / sitemap references",
    issueCode: `<!-- Discovered but not indexed pages warning in GSC -->
Google Search Console: 42 pages excluded`,
    suggestion: "Audit Google Search Console Page Indexing report for excluded pages.",
    solutionCode: `Sitemap: https://yourdomain.com/sitemap.xml`,
  },
  {
    id: 49,
    category: "security",
    name: "Bing Webmaster Tools",
    description: "Bing WMT configured and sitemap submitted.",
    priority: "medium",
    tools: "Bing WMT",
    maxScore: 5,
    codeLocation: "<head> meta verification tag or Bing portal",
    issueCode: `<!-- Site missing Bing Webmaster verification -->
<!-- msvalidate.01 meta tag absent -->`,
    suggestion: "Verify site ownership in Bing Webmaster Tools and submit XML sitemap.",
    solutionCode: `<meta name="msvalidate.01" content="YOUR_BING_VERIFICATION_CODE" />`,
  },
  {
    id: 50,
    category: "eeat",
    name: "Author & About pages",
    description: "Author bios, credentials, about page present.",
    priority: "high",
    tools: "Manual",
    maxScore: 5,
    codeLocation: "footer links & author profile routes",
    issueCode: `<!-- Anonymous content without author bio or About page links -->
<!-- Footer lacks company credentials & author info -->`,
    suggestion: "Create transparent About Us and Author profile pages to boost E-E-A-T signals.",
    solutionCode: `<nav className="footer-links">
  <a href="/about">About Us</a>
  <a href="/authors/john-doe">Author Profile</a>
</nav>`,
  },
  {
    id: 51,
    category: "eeat",
    name: "Content freshness signals",
    description: "Last-modified dates, updated content indicators.",
    priority: "high",
    tools: "SF / Manual",
    maxScore: 5,
    codeLocation: "article header component & JSON-LD schema",
    issueCode: `<!-- Stale content date or missing publication date -->
<!-- No <time> element or dateModified in schema -->`,
    suggestion: "Display last modified dates on article headers and include dateModified in JSON-LD schema.",
    solutionCode: `<time dateTime="2026-07-25">Updated: July 25, 2026</time>`,
  },
  {
    id: 52,
    category: "eeat",
    name: "Outbound links – authoritative sources",
    description: "Cites authoritative sources, no broken outbound links.",
    priority: "medium",
    tools: "Screaming Frog",
    maxScore: 5,
    codeLocation: "article body content links",
    issueCode: `<!-- Claims made without citing authoritative sources -->
<p>Studies show SEO improves traffic by 500%.</p> <!-- no source citation -->`,
    suggestion: "Cite reputable authoritative external sources in body copy using standard anchor links.",
    solutionCode: `<a href="https://developers.google.com/search/docs" target="_blank" rel="noopener noreferrer">Google Search Documentation</a>`,
  },
  {
    id: 53,
    category: "eeat",
    name: "Breadcrumb navigation",
    description: "Breadcrumbs present with BreadcrumbList schema.",
    priority: "medium",
    tools: "SF / Rich Results",
    maxScore: 5,
    codeLocation: "page header navigation & JSON-LD schema script",
    issueCode: `<!-- Deep sub-page missing breadcrumb navigation UI -->
<main>
  <!-- Breadcrumb list absent -->
</main>`,
    suggestion: "Provide breadcrumb navigation UI and embed BreadcrumbList schema.",
    solutionCode: `<nav aria-label="Breadcrumb">
  <ol className="flex gap-2 text-sm">
    <li><a href="/">Home</a> / </li>
    <li><a href="/blog">Blog</a> / </li>
    <li aria-current="page">SEO Audit</li>
  </ol>
</nav>`,
  },
  {
    id: 54,
    category: "eeat",
    name: "404 & error page UX",
    description: "Custom 404 with navigation, returns 404 status.",
    priority: "medium",
    tools: "Manual",
    maxScore: 5,
    codeLocation: "src/app/not-found.tsx",
    issueCode: `<!-- Default browser un-styled 404 error page -->
404 Not Found (Apache default response)`,
    suggestion: "Design a custom 404 error page with clear navigation back to main site sections.",
    solutionCode: `export default function NotFound() {
  return (
    <main className="p-8 text-center">
      <h1>404 - Page Not Found</h1>
      <p>Sorry, the page you are looking for does not exist.</p>
      <a href="/" className="btn">Back to Home</a>
    </main>
  );
}`,
  },
  {
    id: 55,
    category: "eeat",
    name: "Core vitals UX signals",
    description: "No intrusive interstitials, accessible navigation.",
    priority: "high",
    tools: "Lighthouse",
    maxScore: 5,
    codeLocation: "modal & cookie banner component",
    issueCode: `<!-- Full-screen modal blocking page entry -->
<div className="fixed inset-0 bg-black/90 z-50">
  <h2>Subscribe to newsletter before reading!</h2>
</div>`,
    suggestion: "Avoid full-screen intrusive popups on page entry that block main content.",
    solutionCode: `<!-- Non-intrusive bottom banner -->
<div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900 text-white">
  <span>We use cookies to improve your experience.</span>
</div>`,
  },
];

export function getCheckpoint(id: number): FrameworkCheckpoint | undefined {
  return FRAMEWORK_CHECKPOINTS.find((c) => c.id === id);
}

export function getGrade(percentage: number): "elite" | "good" | "needs-work" | "critical" {
  // Must match the number shown as overall % (scorePercentage on the report)
  if (percentage >= 90) return "elite";
  if (percentage >= 70) return "good";
  if (percentage >= 50) return "needs-work";
  return "critical"; // 0–49
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "text-danger bg-danger/15 border-danger/30",
  high: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  medium: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  low: "text-muted bg-background/60 border-card-border",
};

export const STATUS_COLORS: Record<string, string> = {
  pass: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  warn: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  fail: "text-danger bg-danger/15 border-danger/30",
  na: "text-muted bg-background/60 border-card-border",
  manual: "text-sky-400 bg-sky-500/15 border-sky-500/30",
};
