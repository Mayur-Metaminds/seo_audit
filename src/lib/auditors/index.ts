import type { CheckResult, CrawledPage } from "@/types/audit.types";
import type { CrawlResult } from "@/lib/crawler/siteCrawler";
import {
  getCanonical,
  getH1Elements,
  getHeadings,
  getHreflangTags,
  getImages,
  getJsonLdSchemas,
  getMetaContent,
  getOpenGraphTags,
  getRobotsMeta,
  getTitle,
  getTwitterTags,
  getWordCount,
  hasBreadcrumbs,
  hasMainContent,
  hasViewportMeta,
  parseHtml,
  extractRealElementSnippet,
} from "@/lib/utils/html";
import { getDomain, isSameDomain, resolveUrl, normalizeUrl } from "@/lib/utils/url";
import { enrichWithExplainer } from "@/data/checkpointExplainers";

export { auditPerformance } from "@/lib/performance/auditPerformance";

function makeResult(
  checkpointId: number,
  status: CheckResult["status"],
  score: number,
  maxScore: number,
  message: string,
  options?: Partial<CheckResult>
): CheckResult {
  const explained = enrichWithExplainer(checkpointId, status, {
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
    scope: options?.scope || "site",
    ...explained,
    ...options,
    isGenuineSeoIssue: options?.isGenuineSeoIssue ?? explained.isGenuineSeoIssue,
  };
}

export function auditPage(page: CrawledPage, baseUrl: string): CheckResult[] {
  const checks: CheckResult[] = [];
  const $ = parseHtml(page.html);
  const url = page.finalUrl;

  // #4 Canonical
  const canonical = getCanonical($);
  if (!canonical) {
    const headSnippet = extractRealElementSnippet($, "head") || "<head>\n  <!-- Missing canonical tag -->\n</head>";
    checks.push(makeResult(4, "fail", 0, 5, "Missing canonical tag", {
      scope: "page",
      issueCode: headSnippet,
      solutionCode: headSnippet.replace("</head>", `  <link rel="canonical" href="${url}" />\n</head>`),
      recommendation: "Add a self-referencing canonical link tag pointing to this page's preferred URL.",
      affectedUrls: [url],
    }));
  } else {
    const canonicalUrl = canonical.startsWith("http") ? canonical : resolveUrl(canonical, url) || canonical;
    const isSelfRef = canonicalUrl ? normalizeUrl(canonicalUrl) === normalizeUrl(page.finalUrl) : false;
    const realCan = extractRealElementSnippet($, "link[rel='canonical']") || `<link rel="canonical" href="${canonical}" />`;

    if (!canonical.startsWith("http") && !isSelfRef) {
      checks.push(makeResult(4, "warn", 3, 5, "Canonical is a relative URL", {
        scope: "page",
        evidence: [canonical],
        issueCode: `- ${realCan}`,
        solutionCode: `+ <link rel="canonical" href="${url}" />`,
        recommendation: "Use absolute self-referencing URLs in canonical tags.",
        affectedUrls: [url],
      }));
    } else if (!isSelfRef) {
      checks.push(makeResult(4, "warn", 2, 5, "Canonical points to a different URL", {
        scope: "page",
        evidence: [canonical],
        issueCode: `- ${realCan}`,
        solutionCode: `+ <link rel="canonical" href="${url}" />`,
        recommendation: "Ensure canonical matches the preferred URL for this page.",
        affectedUrls: [url],
      }));
    } else {
      checks.push(makeResult(4, "pass", 5, 5, "Self-referencing canonical tag present", { scope: "page", evidence: [canonical] }));
    }
  }

  // #5 Redirect chains
  if (page.redirectChain.length > 1) {
    checks.push(makeResult(5, "fail", 0, 5, `Redirect chain has ${page.redirectChain.length} hops`, {
      scope: "page",
      evidence: page.redirectChain,
      recommendation: "Collapse redirect chains to a single 301 redirect.",
      affectedUrls: [url],
    }));
  } else if (page.redirectStatuses.some((s) => s === 302 || s === 307)) {
    checks.push(makeResult(5, "warn", 2, 5, "Temporary redirect (302/307) detected — use 301 for permanent moves", {
      scope: "page",
      evidence: page.redirectChain,
      affectedUrls: [url],
    }));
  } else if (page.redirectChain.length === 1) {
    checks.push(makeResult(5, "pass", 5, 5, "Single redirect hop (acceptable)", { scope: "page" }));
  } else if (page.statusCode === 310) {
    checks.push(makeResult(5, "fail", 0, 5, "Redirect loop detected", { scope: "page", affectedUrls: [url] }));
  } else {
    checks.push(makeResult(5, "pass", 5, 5, "No redirect chain", { scope: "page" }));
  }

  // #6 Status codes
  if (page.statusCode >= 500) {
    checks.push(makeResult(6, "fail", 0, 5, `Server error: HTTP ${page.statusCode}`, { scope: "page", affectedUrls: [url] }));
  } else if (page.statusCode >= 400) {
    checks.push(makeResult(6, "fail", 0, 5, `Client error: HTTP ${page.statusCode}`, { scope: "page", affectedUrls: [url] }));
  } else {
    checks.push(makeResult(6, "pass", 5, 5, `HTTP ${page.statusCode}`, { scope: "page" }));
  }

  // #7 Noindex / nofollow
  const robotsMeta = getRobotsMeta($);
  const xRobots = page.headers["x-robots-tag"] || "";
  const isNoindex = robotsMeta.includes("noindex") || xRobots.toLowerCase().includes("noindex");
  const isNofollow = robotsMeta.includes("nofollow") || xRobots.toLowerCase().includes("nofollow");
  if (isNoindex) {
    checks.push(makeResult(7, "warn", 2, 5, "Page is set to noindex", {
      scope: "page",
      evidence: [robotsMeta || xRobots],
      recommendation: "Verify this page should not be indexed.",
      affectedUrls: [url],
    }));
  } else if (isNofollow) {
    checks.push(makeResult(7, "warn", 3, 5, "Page has nofollow directive", {
      scope: "page",
      evidence: [robotsMeta || xRobots],
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(7, "pass", 5, 5, "Page is indexable", { scope: "page" }));
  }

  // #8 Hreflang
  const hreflangs = getHreflangTags($);
  if (hreflangs.length > 0) {
    const hasXDefault = hreflangs.some((h) => h.hreflang === "x-default");
    checks.push(
      makeResult(8, hasXDefault ? "pass" : "warn", hasXDefault ? 5 : 3, 5,
        hasXDefault ? `${hreflangs.length} hreflang tags with x-default` : "Hreflang present but missing x-default",
        { scope: "page", evidence: hreflangs.map((h) => `${h.hreflang}: ${h.href}`) }
      )
    );
  } else {
    checks.push(makeResult(8, "na", 5, 5, "No hreflang tags (N/A for single-language sites)", { scope: "page" }));
  }

  // #9 Title
  const title = getTitle($);
  const realTitleHead = extractRealElementSnippet($, "head") || "<head>\n  <title>Your Title</title>\n</head>";
  if (!title) {
    checks.push(makeResult(9, "fail", 0, 5, "Missing title tag", {
      scope: "page",
      issueCode: realTitleHead,
      solutionCode: realTitleHead.replace("</head>", "  <title>Descriptive 50-60 Character Title | Brand</title>\n</head>"),
      recommendation: "Add a unique, descriptive title tag (50-60 characters).",
      affectedUrls: [url],
    }));
  } else if (title.length < 30) {
    checks.push(makeResult(9, "warn", 2, 5, `Title too short (${title.length} chars)`, {
      scope: "page",
      evidence: [title],
      issueCode: `- <title>${title}</title>`,
      solutionCode: `+ <title>${title} | Full Descriptive Title Keywords</title>`,
      recommendation: "Expand title to 50-60 characters with primary keyword.",
      affectedUrls: [url],
    }));
  } else if (title.length > 60) {
    checks.push(makeResult(9, "warn", 3, 5, `Title too long (${title.length} chars)`, {
      scope: "page",
      evidence: [title],
      issueCode: `- <title>${title}</title>`,
      solutionCode: `+ <title>${title.slice(0, 55)}...</title>`,
      recommendation: "Shorten title to 50-60 characters to avoid truncation in SERPs.",
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(9, "pass", 5, 5, `Title OK (${title.length} chars)`, { scope: "page", evidence: [title] }));
  }

  // #10 Meta description
  const description = getMetaContent($, "description");
  const realDescHead = extractRealElementSnippet($, "head") || "<head>\n  <!-- Missing meta description -->\n</head>";
  if (!description) {
    checks.push(makeResult(10, "fail", 0, 5, "Missing meta description", {
      scope: "page",
      issueCode: realDescHead,
      solutionCode: realDescHead.replace("</head>", '  <meta name="description" content="Add your unique 120-155 character meta description summary here." />\n</head>'),
      recommendation: "Add a unique meta description (120-155 chars) with CTA.",
      affectedUrls: [url],
    }));
  } else if (description.length < 70) {
    checks.push(makeResult(10, "warn", 2, 5, `Meta description too short (${description.length} chars)`, {
      scope: "page",
      evidence: [description],
      issueCode: `- <meta name="description" content="${description}" />`,
      solutionCode: `+ <meta name="description" content="${description} ... Add detailed CTA summary text." />`,
      affectedUrls: [url],
    }));
  } else if (description.length > 160) {
    checks.push(makeResult(10, "warn", 3, 5, `Meta description too long (${description.length} chars)`, {
      scope: "page",
      evidence: [description],
      issueCode: `- <meta name="description" content="${description}" />`,
      solutionCode: `+ <meta name="description" content="${description.slice(0, 150)}..." />`,
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(10, "pass", 5, 5, `Meta description OK (${description.length} chars)`, {
      scope: "page",
      evidence: [description],
    }));
  }

  // #11 H1 — exactly one non-empty H1 per page
  const h1Elements = getH1Elements($);
  const h1Texts = h1Elements.map((h) => h.text);
  const titleFallback = (typeof title === "string" && title.trim()) || "Descriptive Page Heading";
  const mainSnippet =
    extractRealElementSnippet($, "main") ||
    extractRealElementSnippet($, "article") ||
    extractRealElementSnippet($, "header") ||
    "<main>\n  <!-- page content -->\n</main>";

  if (h1Elements.length === 0) {
    const emptyH1Count = $("h1").length;
    checks.push(
      makeResult(11, "fail", 0, 5, emptyH1Count > 0 ? "H1 present but empty" : "Missing H1 tag", {
        scope: "page",
        evidence: emptyH1Count > 0 ? [`Found ${emptyH1Count} empty <h1> element(s)`] : ["No <h1> elements in HTML"],
        issueCode: emptyH1Count > 0
          ? extractRealElementSnippet($, "h1") || "<!-- Empty <h1></h1> -->"
          : `<!-- Missing H1 on ${url} -->\n${mainSnippet}`,
        solutionCode: `<!-- Use the page's primary topic as the sole H1 -->\n<main>\n  <h1>${titleFallback}</h1>\n  <!-- Keep section titles as <h2>/<h3>, not additional <h1> -->\n</main>`,
        recommendation:
          "Add exactly one visible <h1> near the top of main content that matches the page title/intent. Do not hide the only H1 with sr-only if the visual title is a plain <div>.",
        suggestion:
          "Replace decorative title <div>s with a single semantic <h1>, or promote the visible heading to <h1>.",
        codeLocation: "<main> / page hero heading",
        affectedUrls: [url],
        confidence: page.rendered ? "measured" : "high",
        isGenuineSeoIssue: true,
      })
    );
  } else if (h1Elements.length > 1) {
    const primary = h1Elements[0];
    const extras = h1Elements.slice(1);
    const issueLines = h1Elements
      .map((h, i) => `- <h1${h.classes ? ` class="${h.classes}"` : ""}>${h.text}</h1>${i === 0 ? "  <!-- keep as H1 -->" : "  <!-- demote to H2 -->"}`)
      .join("\n");
    const solutionLines = [
      `+ <h1>${primary.text}</h1>`,
      ...extras.map((h) => `+ <h2>${h.text}</h2>`),
    ].join("\n");

    checks.push(
      makeResult(11, "fail", 0, 5, `Multiple H1 tags found (${h1Elements.length})`, {
        scope: "page",
        evidence: h1Texts.map((t, i) => `H1 #${i + 1}: ${t}`),
        issueCode: `<!-- ${h1Elements.length} H1s on ${url} — keep one, demote the rest -->\n${issueLines}`,
        solutionCode: `<!-- Exactly one H1; convert extras to H2 -->\n${solutionLines}`,
        recommendation: `Keep one primary H1 ("${primary.text.slice(0, 80)}") and convert the other ${extras.length} heading(s) to <h2>/<h3>.`,
        suggestion: "Section headings inside article body should be <h2>–<h3>, not additional <h1> tags.",
        codeLocation: "<main> content / CMS rich-text blocks",
        affectedUrls: [url],
        confidence: page.rendered ? "measured" : "high",
        isGenuineSeoIssue: true,
      })
    );
  } else if (h1Elements[0].isVisuallyHidden) {
    checks.push(
      makeResult(11, "warn", 3, 5, "Only H1 is visually hidden (e.g. sr-only)", {
        scope: "page",
        evidence: [
          `H1: ${h1Elements[0].text}`,
          `class="${h1Elements[0].classes}"`,
          "Visible title may be a non-semantic <div>",
        ],
        issueCode: `- ${h1Elements[0].outerHtml}\n<!-- Visual title is likely a styled <div>, not the H1 -->`,
        solutionCode: `+ <h1 class="text-primary text-[32px] md:text-[36px] font-semibold">${h1Elements[0].text}</h1>\n<!-- Remove duplicate sr-only H1 / title <div> -->`,
        recommendation:
          "Make the visible page title the real <h1>. Screen-reader-only H1s are better than none, but search engines and users expect the primary heading to be visible.",
        suggestion: "Apply the visual title styles to the <h1> and remove the duplicate decorative <div>.",
        codeLocation: "page hero / title component",
        affectedUrls: [url],
        confidence: page.rendered ? "measured" : "high",
        isGenuineSeoIssue: true,
      })
    );
  } else {
    checks.push(
      makeResult(11, "pass", 5, 5, "Exactly one H1 tag", {
        scope: "page",
        evidence: h1Texts,
        confidence: page.rendered ? "measured" : "high",
      })
    );
  }

  // #12 Heading hierarchy (document order)
  const headings = getHeadings($);
  const skipExamples: string[] = [];
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;
    if (curr - prev > 1) {
      skipExamples.push(`H${prev} → H${curr}: "${headings[i].text.slice(0, 60)}"`);
    }
  }
  if (headings.length === 0) {
    checks.push(makeResult(12, "warn", 2, 5, "No heading structure found", {
      scope: "page",
      affectedUrls: [url],
      recommendation: "Add a logical H1 → H2 → H3 outline for the page content.",
    }));
  } else if (skipExamples.length > 0) {
    checks.push(makeResult(12, "warn", 3, 5, `Heading hierarchy skips levels (${skipExamples.length})`, {
      scope: "page",
      evidence: skipExamples.slice(0, 5),
      recommendation: "Maintain logical H1→H2→H3 order without skipping levels.",
      issueCode: skipExamples.map((s) => `- ${s}`).join("\n"),
      solutionCode: `<!-- Example outline -->\n<h1>Main Topic</h1>\n<h2>Section</h2>\n<h3>Subsection</h3>`,
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(12, "pass", 5, 5, `Logical heading hierarchy (${headings.length} headings)`, { scope: "page" }));
  }

  // #13 Content depth
  const wordCount = getWordCount($);
  if (wordCount < 100) {
    checks.push(makeResult(13, "warn", 2, 5, `Thin content (${wordCount} words)`, {
      scope: "page",
      recommendation: "Add substantive content (300+ words for content pages).",
      affectedUrls: [url],
    }));
  } else if (wordCount < 300) {
    checks.push(makeResult(13, "warn", 3, 5, `Moderate content depth (${wordCount} words)`, { scope: "page", affectedUrls: [url] }));
  } else {
    checks.push(makeResult(13, "pass", 5, 5, `Good content depth (${wordCount} words)`, { scope: "page" }));
  }

  // #14 Internal links
  const internalLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const resolved = resolveUrl(href, url);
    if (resolved && isSameDomain(resolved, baseUrl)) internalLinks.push(resolved);
  });
  if (internalLinks.length < 3) {
    checks.push(makeResult(14, "warn", 2, 5, `Only ${internalLinks.length} internal links`, {
      scope: "page",
      recommendation: "Add 3-5 contextual internal links per page.",
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(14, "pass", 5, 5, `${internalLinks.length} internal links`, { scope: "page" }));
  }

  // #15 Image alt text
  const images = getImages($);
  const missingAlt = images.filter((img) => !img.alt);
  const decorativeOk = images.filter((img) => img.alt === "");
  const realImgSnippet = extractRealElementSnippet($, "img:not([alt])") || extractRealElementSnippet($, "img") || "<img src=\"/example.jpg\" />";
  if (images.length === 0) {
    checks.push(makeResult(15, "na", 5, 5, "No images on page", { scope: "page" }));
  } else if (missingAlt.length > 0) {
    checks.push(makeResult(15, "fail", 1, 5, `${missingAlt.length}/${images.length} images missing alt attribute`, {
      scope: "page",
      issueCode: realImgSnippet,
      solutionCode: realImgSnippet.replace("<img ", '<img alt="Descriptive image text" '),
      recommendation: "Add descriptive alt text to all meaningful images.",
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(15, "pass", 5, 5, `All ${images.length} images have alt attributes`, { scope: "page" }));
  }
  void decorativeOk;

  // #16 Schema
  const schemas = getJsonLdSchemas($);
  if (schemas.length === 0) {
    checks.push(makeResult(16, "fail", 0, 5, "No JSON-LD structured data", {
      scope: "page",
      recommendation: "Add relevant schema (Organization, BreadcrumbList, Article, etc.).",
      affectedUrls: [url],
    }));
  } else {
    const types = schemas.flatMap((s) => {
      if (typeof s === "object" && s !== null && "@type" in s) return [(s as { "@type": string })["@type"]];
      if (Array.isArray(s)) return s.map((item) => (item as { "@type"?: string })["@type"]).filter(Boolean) as string[];
      return [];
    });
    checks.push(makeResult(16, "pass", 5, 5, `JSON-LD schema found: ${types.join(", ") || "present"}`, {
      scope: "page",
      evidence: types,
    }));
  }

  const og = getOpenGraphTags($);
  if (!og["og:title"] || !og["og:description"] || !og["og:image"]) {
    if (schemas.length > 0) {
      checks[checks.length - 1] = {
        ...checks[checks.length - 1],
        status: "warn",
        score: 3,
        message: `JSON-LD present but Open Graph tags incomplete`,
        recommendation: "Add og:title, og:description, and og:image for social sharing.",
      };
    }
  }
  void getTwitterTags($);
  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname;
  const urlIssues: string[] = [];
  if (path !== path.toLowerCase() && /[A-Z]/.test(path)) urlIssues.push("Contains uppercase characters");
  if (path.includes("_")) urlIssues.push("Uses underscores instead of hyphens");
  if ((path.match(/\//g) || []).length > 4) urlIssues.push("Deep URL structure (>3 subdirectories)");
  if (path.length > 100) urlIssues.push("Very long URL slug");
  if (urlIssues.length > 0) {
    checks.push(makeResult(18, "warn", 3, 5, `URL issues: ${urlIssues.join(", ")}`, {
      scope: "page",
      evidence: [url],
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(18, "pass", 5, 5, "Clean URL structure", { scope: "page", evidence: [url] }));
  }

  // #20 Mobile viewport
  if (!hasViewportMeta($)) {
    checks.push(makeResult(20, "fail", 0, 5, "Missing viewport meta tag", {
      scope: "page",
      recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(20, "pass", 5, 5, "Viewport meta tag present", { scope: "page" }));
  }

  // #22 JS rendering — compare raw HTML vs headless DOM when available
  const rawHtml = page.rawHtml;
  const rawHasMain = rawHtml ? hasMainContent(parseHtml(rawHtml)) : hasMainContent($);
  const renderedHasMain = page.rendered ? hasMainContent($) : rawHasMain;
  const rawH1Count = rawHtml ? getH1Elements(parseHtml(rawHtml)).length : getH1Elements($).length;
  const renderedH1Count = getH1Elements($).length;

  if (!rawHasMain && renderedHasMain) {
    checks.push(
      makeResult(22, "fail", 0, 5, "Critical content only appears after JavaScript render", {
        scope: "page",
        confidence: page.rendered ? "measured" : "medium",
        evidence: [
          page.rendered ? "Compared raw HTTP HTML vs Chromium DOM" : "Based on fetched HTML body text",
          `Raw HTML main content: missing · Rendered DOM: present`,
          `H1 count raw/rendered: ${rawH1Count}/${renderedH1Count}`,
        ],
        recommendation: "SSR/SSG the H1 and primary article text so crawlers see content without relying on JS execution timing.",
        issueCode: "<!-- Initial HTML lacks main/article text; content injected client-side -->",
        solutionCode: `// Prefer Server Components / getStaticProps / SSR so <h1> and body copy ship in first HTML\nexport default async function Page() {\n  const data = await getContent();\n  return <main><h1>{data.title}</h1><article>{data.body}</article></main>;\n}`,
        affectedUrls: [url],
        isGenuineSeoIssue: true,
      })
    );
  } else if (!rawHasMain && !renderedHasMain) {
    checks.push(
      makeResult(22, "fail", 0, 5, "Critical content missing even after render", {
        scope: "page",
        confidence: page.rendered ? "measured" : "medium",
        evidence: ["No substantial main/article/H1/paragraph text detected"],
        recommendation: "Ensure H1 and main content are in the HTML response (SSR/SSG).",
        affectedUrls: [url],
        isGenuineSeoIssue: true,
      })
    );
  } else if (page.rendered && rawH1Count === 0 && renderedH1Count > 0) {
    checks.push(
      makeResult(22, "warn", 3, 5, "H1 injected by client JS (present after render only)", {
        scope: "page",
        confidence: "measured",
        evidence: [`Raw H1s: 0 · Rendered H1s: ${renderedH1Count}`, `Render time: ${page.renderMs ?? "?"}ms`],
        recommendation: "Include the H1 in the server HTML for faster, more reliable indexing.",
        affectedUrls: [url],
        isGenuineSeoIssue: true,
      })
    );
  } else {
    checks.push(
      makeResult(22, "pass", 5, 5, page.rendered ? "Main content in HTML (verified with headless render)" : "Main content present in HTML", {
        scope: "page",
        confidence: page.rendered ? "measured" : "medium",
        evidence: page.rendered
          ? [`Chromium render OK (${page.renderMs ?? "?"}ms)`, `H1s raw/rendered: ${rawH1Count}/${renderedH1Count}`]
          : ["Evaluated from HTTP response HTML"],
      })
    );
  }

  // #18 URL structure
  if (hasBreadcrumbs($)) {
    const hasBreadcrumbSchema = schemas.some((s) => JSON.stringify(s).includes("BreadcrumbList"));
    checks.push(makeResult(53, hasBreadcrumbSchema ? "pass" : "warn", hasBreadcrumbSchema ? 5 : 3, 5,
      hasBreadcrumbSchema ? "Breadcrumbs with schema" : "Breadcrumbs present but missing BreadcrumbList schema",
      { scope: "page" }
    ));
  } else if (path !== "/" && path.split("/").filter(Boolean).length > 1) {
    checks.push(makeResult(53, "warn", 2, 5, "No breadcrumb navigation on deep page", {
      scope: "page",
      recommendation: "Add breadcrumb navigation with BreadcrumbList schema.",
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(53, "na", 5, 5, "Breadcrumbs not required for this page depth", { scope: "page" }));
  }

  return checks;
}

export function auditAssets(page: CrawledPage): CheckResult[] {
  const checks: CheckResult[] = [];
  const $ = parseHtml(page.html);
  const url = page.finalUrl;
  const images = getImages($);

  // #34 Images
  const modernFormats = images.filter((img) => /\.(webp|avif)/i.test(img.src));
  const lazyLoaded = images.filter((img) => img.loading === "lazy");
  if (images.length === 0) {
    checks.push(makeResult(34, "na", 5, 5, "No images to audit", { scope: "page" }));
  } else {
    const modernPct = (modernFormats.length / images.length) * 100;
    if (modernPct < 30) {
      checks.push(makeResult(34, "warn", 2, 5, `Only ${modernPct.toFixed(0)}% images use WebP/AVIF`, {
        scope: "page",
        recommendation: "Serve images in AVIF/WebP with fallbacks.",
        affectedUrls: [url],
      }));
    } else {
      checks.push(makeResult(34, "pass", 5, 5, `${modernPct.toFixed(0)}% images use modern formats`, { scope: "page" }));
    }
    void lazyLoaded;
  }

  // #35 CSS
  const stylesheets = $('link[rel="stylesheet"]').length;
  const renderBlocking = stylesheets;
  if (renderBlocking > 5) {
    checks.push(makeResult(35, "warn", 2, 5, `${renderBlocking} render-blocking stylesheets`, {
      scope: "page",
      recommendation: "Inline critical CSS, defer non-critical styles.",
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(35, "pass", 5, 5, `${renderBlocking} stylesheets (acceptable)`, { scope: "page" }));
  }

  // #36 JS bundle
  const scripts = $("script[src]").length;
  const inlineScripts = $("script:not([src])").length;
  if (scripts > 20) {
    checks.push(makeResult(36, "fail", 1, 5, `${scripts} external scripts — bundle bloat`, { scope: "page", affectedUrls: [url] }));
  } else if (scripts > 10) {
    checks.push(makeResult(36, "warn", 3, 5, `${scripts} external scripts`, { scope: "page", affectedUrls: [url] }));
  } else {
    checks.push(makeResult(36, "pass", 5, 5, `JS payload reasonable (${scripts} external, ${inlineScripts} inline)`, { scope: "page" }));
  }

  // #37 Third-party
  const thirdParty = $("script[src]")
    .map((_, el) => $(el).attr("src") || "")
    .get()
    .filter((src) => src.startsWith("http") && !src.includes(new URL(url).hostname));
  if (thirdParty.length > 8) {
    checks.push(makeResult(37, "fail", 1, 5, `${thirdParty.length} third-party scripts`, {
      scope: "page",
      evidence: thirdParty.slice(0, 5),
      affectedUrls: [url],
    }));
  } else if (thirdParty.length > 4) {
    checks.push(makeResult(37, "warn", 3, 5, `${thirdParty.length} third-party scripts`, { scope: "page", affectedUrls: [url] }));
  } else {
    checks.push(makeResult(37, "pass", 5, 5, `Third-party scripts minimal (${thirdParty.length})`, { scope: "page" }));
  }

  // #38 Fonts
  const fontLinks = $('link[href*=".woff"], link[rel="preload"][as="font"]');
  const hasFontDisplay = page.html.includes("font-display");
  if (fontLinks.length > 0 && !hasFontDisplay) {
    checks.push(makeResult(38, "warn", 3, 5, "Custom fonts without font-display:swap detected", {
      scope: "page",
      recommendation: "Use font-display: swap and preload critical fonts.",
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(38, "pass", 5, 5, "Font loading appears optimised", { scope: "page" }));
  }

  // #39 Resource hints
  const preconnect = $('link[rel="preconnect"]').length;
  const preload = $('link[rel="preload"]').length;
  if (preconnect === 0 && preload === 0) {
    checks.push(makeResult(39, "warn", 2, 5, "No resource hints (preconnect/preload)", {
      scope: "page",
      recommendation: "Add preconnect for CDN origins and preload for LCP image.",
      affectedUrls: [url],
    }));
  } else {
    checks.push(makeResult(39, "pass", 5, 5, `Resource hints: ${preconnect} preconnect, ${preload} preload`, { scope: "page" }));
  }

  // #40 Compression — fetch auto-decompresses, so treat as manual verification
  const encoding = page.headers["content-encoding"] || "";
  if (encoding.includes("br") || encoding.includes("gzip")) {
    checks.push(makeResult(40, "pass", 5, 5, `Compression header present: ${encoding}`, { scope: "page" }));
  } else {
    checks.push(makeResult(40, "manual", 5, 5, "Compression cannot be verified from fetch (auto-decompressed)", {
      scope: "page",
      recommendation: "Verify Brotli/Gzip with curl -H 'Accept-Encoding: br,gzip' -I on your server.",
      affectedUrls: [url],
    }));
  }

  // #41 Caching
  const cacheControl = page.headers["cache-control"] || "";
  if (cacheControl.includes("max-age") && !cacheControl.includes("max-age=0")) {
    checks.push(makeResult(41, "pass", 5, 5, `Cache-Control set: ${cacheControl}`, { scope: "page" }));
  } else {
    checks.push(makeResult(41, "warn", 3, 5, "HTML caching policy could be improved", {
      scope: "page",
      recommendation: "Set appropriate Cache-Control for static assets (max-age=31536000).",
      affectedUrls: [url],
    }));
  }

  return checks;
}

export function auditSecurity(
  page: CrawledPage,
  sensitiveFiles: { path: string; exposed: boolean }[],
  notFoundCheck: { returns404: boolean; hasCustom404: boolean }
): CheckResult[] {
  const checks: CheckResult[] = [];

  // #44 Security headers
  const required = ["x-content-type-options", "x-frame-options", "referrer-policy"];
  const missing = required.filter((h) => !page.headers[h]);
  const hasCsp = Boolean(page.headers["content-security-policy"]);
  if (missing.length > 1) {
    checks.push(makeResult(44, "fail", 1, 5, `Missing security headers: ${missing.join(", ")}`, {
      recommendation: "Add CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.",
    }));
  } else if (missing.length === 1 || !hasCsp) {
    checks.push(makeResult(44, "warn", 3, 5, `Partial security headers (missing: ${missing.join(", ") || "CSP"})`, {
      evidence: Object.keys(page.headers).filter((h) => h.startsWith("x-") || h.includes("security") || h.includes("policy")),
    }));
  } else {
    checks.push(makeResult(44, "pass", 5, 5, "Security headers configured", { scope: "site" }));
  }

  // #45 Sensitive files
  const exposed = sensitiveFiles.filter((f) => f.exposed);
  if (exposed.length > 0) {
    checks.push(makeResult(45, "fail", 0, 5, `Sensitive files exposed: ${exposed.map((f) => f.path).join(", ")}`, {
      recommendation: "Block access to sensitive files immediately.",
      evidence: exposed.map((f) => f.path),
    }));
  } else {
    checks.push(makeResult(45, "pass", 5, 5, "No sensitive files publicly accessible", { scope: "site" }));
  }

  // #46 Soft 404
  if (!notFoundCheck.returns404) {
    checks.push(makeResult(46, "fail", 0, 5, "Server returns 200 for non-existent pages (soft 404)", {
      recommendation: "Return proper HTTP 404 status for missing pages.",
    }));
  } else if (!notFoundCheck.hasCustom404) {
    checks.push(makeResult(46, "warn", 3, 5, "404 page exists but may lack helpful navigation", {
      recommendation: "Create a custom 404 page with site navigation and search.",
    }));
  } else {
    checks.push(makeResult(46, "pass", 5, 5, "Proper 404 handling with custom page", { scope: "site" }));
  }

  // #47 Client-side redirects
  const hasMetaRefresh = page.html.includes('http-equiv="refresh"') || page.html.includes("http-equiv='refresh'");
  if (hasMetaRefresh) {
    checks.push(makeResult(47, "warn", 3, 5, "Meta refresh redirect detected", {
      recommendation: "Use server-side 301/302 redirects instead of meta refresh.",
    }));
  } else {
    checks.push(makeResult(47, "pass", 5, 5, "No client-side redirects detected", { scope: "site" }));
  }

  return checks;
}

export function auditEeat(crawl: CrawlResult): CheckResult[] {
  const checks: CheckResult[] = [];
  const aboutUrls = crawl.allDiscoveredUrls.filter((u) => /\/(about|our-story|our-people|team|authors?)(\/|$)/i.test(new URL(u).pathname));
  const hasAbout = aboutUrls.length > 0;
  const hasAuthorSchema = crawl.pages.some((p) => p.html && (p.html.includes('"@type":"Person"') || p.html.includes('"@type": "Person"')));
  const hasAuthorByline = crawl.pages.some((p) => p.html && /\b(written by|byline|article:author)\b/i.test(p.html));
  if (!hasAbout) {
    checks.push(makeResult(50, "warn", 2, 5, "No About/team page detected", {
      recommendation: "Create detailed About and author bio pages with credentials.",
    }));
  } else if (!hasAuthorSchema && !hasAuthorByline) {
    checks.push(makeResult(50, "warn", 3, 5, "About page found but author bylines not detected on content", {
      recommendation: "Add named authors with Person schema on articles.",
    }));
  } else {
    checks.push(makeResult(50, "pass", 5, 5, "E-E-A-T signals: About and author content detected", { scope: "site" }));
  }

  // #51 Freshness
  const hasLastMod = crawl.sitemap.hasLastmod;
  const hasDateMeta = crawl.pages.some(
    (p) => p.html && (p.html.includes("article:published_time") || p.html.includes("datePublished"))
  );
  if (!hasLastMod && !hasDateMeta) {
    checks.push(makeResult(51, "warn", 2, 5, "No content freshness signals detected", {
      recommendation: "Add last-modified dates in sitemap and article schema.",
    }));
  } else {
    checks.push(makeResult(51, "pass", 5, 5, "Content freshness signals present", { scope: "site" }));
  }

  // #52 Outbound links
  let outboundCount = 0;
  for (const page of crawl.pages) {
    if (!page.html) continue;
    const $ = parseHtml(page.html);
    $("a[href^='http']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!href.includes(new URL(page.finalUrl).hostname)) outboundCount++;
    });
  }
  if (outboundCount === 0) {
    checks.push(makeResult(52, "warn", 2, 5, "No outbound links to authoritative sources", {
      recommendation: "Cite authoritative external sources where relevant.",
    }));
  } else {
    checks.push(makeResult(52, "pass", 5, 5, `${outboundCount} outbound links found across site`, { scope: "site" }));
  }

  // #54 404 UX - handled in security

  // #55 UX signals
  const homepage = crawl.pages[0];
  if (homepage?.html) {
    const $ = parseHtml(homepage.html);
    const hasNav = $("nav").length > 0;
    const hasLang = $("html").attr("lang");
    const hasSkipLink = $('[href="#main"], .skip-link, [class*="skip"]').length > 0;
    if (!hasNav || !hasLang) {
      checks.push(makeResult(55, "warn", 3, 5, "Basic UX/accessibility signals missing", {
        evidence: [!hasNav ? "No <nav>" : "", !hasLang ? "No lang attribute" : ""].filter(Boolean),
        recommendation: "Add lang attribute, navigation, and skip links.",
      }));
    } else {
      checks.push(makeResult(55, "pass", 5, 5, `Good UX signals (nav, lang${hasSkipLink ? ", skip link" : ""})`, { scope: "site" }));
    }
  }

  return checks;
}
