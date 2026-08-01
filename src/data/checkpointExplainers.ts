import type { CheckStatus, Priority } from "@/types/audit.types";

export type SeoImpactLevel = "critical" | "high" | "medium" | "low" | "informational";
export type FindingConfidence = "measured" | "high" | "medium" | "low";

export interface CheckpointExplainer {
  whyItMatters: string;
  seoImpact: SeoImpactLevel;
  rankingEffect: string;
  howToVerify: string;
  commonFalsePositives?: string;
}

/** Deep explanations used by SolutionModal — grounded in how Google actually treats each signal. */
export const CHECKPOINT_EXPLAINERS: Record<number, CheckpointExplainer> = {
  4: {
    whyItMatters:
      "Canonical tags tell search engines which URL is the preferred version when similar/duplicate pages exist. Without a self-referencing canonical, signals can split across variants (params, trailing slash, HTTP/HTTPS).",
    seoImpact: "high",
    rankingEffect: "Indirect — prevents dilution of ranking signals; does not boost rankings by itself.",
    howToVerify: "View page source → confirm a single <link rel=\"canonical\" href=\"…\"> matching the preferred absolute URL.",
  },
  9: {
    whyItMatters:
      "The <title> is a primary on-page relevance signal and the default blue link text in SERPs. Missing or duplicate titles hurt click-through and topical clarity.",
    seoImpact: "critical",
    rankingEffect: "Direct relevance + CTR impact. Unique, descriptive titles are foundational SEO.",
    howToVerify: "View source <title>, or Google: cache:URL / SERP snippet for the page.",
  },
  10: {
    whyItMatters:
      "Meta descriptions do not directly rank pages, but they strongly influence CTR when Google uses them in snippets.",
    seoImpact: "medium",
    rankingEffect: "Indirect via CTR. Missing descriptions often yield poorer auto-generated snippets.",
    howToVerify: "View source meta[name=description]; compare with live SERP snippet.",
  },
  11: {
    whyItMatters:
      "A single clear H1 establishes the page’s primary topic for users and crawlers. Multiple H1s dilute outline clarity; a missing H1 (or only a styled <div> title) weakens semantic structure. Screen-reader-only H1s are better than none, but the visible title should preferably be the real H1.",
    seoImpact: "high",
    rankingEffect:
      "Genuine on-page SEO signal for topical clarity and accessibility. Not a magic ranking boost, but multiple/missing H1s are real structural issues Google and a11y tools flag.",
    howToVerify:
      "DevTools → search for h1. Count non-empty H1s. Confirm the largest visible heading is an H1, not a <div>. Re-check after disabling CSS to see sr-only text.",
    commonFalsePositives:
      "CMS blocks that render section titles as H1; SPA pages where H1 appears only after hydration (we use headless render to avoid that false miss).",
  },
  12: {
    whyItMatters:
      "Logical heading order (H1→H2→H3) helps crawlers and assistive tech understand content hierarchy. Skipping levels is usually an accessibility/structure issue more than a hard ranking penalty.",
    seoImpact: "medium",
    rankingEffect: "Mostly structural/a11y; mild SEO clarity benefit when fixed.",
    howToVerify: "Outline headings in document order; ensure no H1→H4 jumps without H2/H3.",
  },
  15: {
    whyItMatters:
      "Alt text describes images for accessibility and image search. Missing alt is a genuine a11y + image-SEO gap.",
    seoImpact: "medium",
    rankingEffect: "Direct for Google Images; indirect for page quality/a11y.",
    howToVerify: "Inspect <img> elements; decorative images may use alt=\"\".",
  },
  16: {
    whyItMatters:
      "JSON-LD helps eligible rich results (FAQ, Article, Product, Breadcrumb). It is not a direct ranking factor but can improve SERP presentation and CTR.",
    seoImpact: "medium",
    rankingEffect: "Indirect via rich results eligibility — not a ranking boost by itself.",
    howToVerify: "Google Rich Results Test / Schema Markup Validator on the live URL.",
  },
  21: {
    whyItMatters:
      "Core Web Vitals (LCP, INP, CLS) are Google ranking signals for page experience. Field (CrUX) data is what rankings use when available; lab (Lighthouse) diagnoses how to improve.",
    seoImpact: "critical",
    rankingEffect: "Direct page-experience ranking signal when CrUX data exists for the URL/origin.",
    howToVerify: "PageSpeed Insights → Field Data (CrUX) + Lab. Search Console → Core Web Vitals report.",
  },
  22: {
    whyItMatters:
      "Googlebot renders JavaScript, but critical content in the initial HTML is more reliably discovered, indexed faster, and safer under crawl budget constraints.",
    seoImpact: "critical",
    rankingEffect: "CSR-only content can be delayed/missed; SSR/SSG is the reliable pattern for SEO-critical text.",
    howToVerify: "Compare raw fetch HTML vs headless-rendered DOM for H1/main text. Use URL Inspection in GSC.",
  },
  27: {
    whyItMatters:
      "TTFB is a server-responsiveness foundation. Slow TTFB delays every subsequent paint metric (FCP/LCP).",
    seoImpact: "high",
    rankingEffect: "Indirect via LCP/FCP; poor TTFB rarely ranks well on competitive queries.",
    howToVerify: "PSI lab server-response-time audit; CDN/server logs; WebPageTest first byte.",
  },
  28: {
    whyItMatters: "FCP measures when users first see content. Slow FCP correlates with poor perceived performance and weak LCP.",
    seoImpact: "high",
    rankingEffect: "Indirect (lab diagnostic). Field CWV uses LCP/INP/CLS primarily.",
    howToVerify: "Lighthouse/PSI lab FCP; reduce render-blocking CSS/JS.",
  },
  29: {
    whyItMatters:
      "LCP is a Core Web Vital — the render time of the largest above-the-fold content. Slow LCP directly affects page experience rankings.",
    seoImpact: "critical",
    rankingEffect: "Direct CWV ranking signal (field data preferred).",
    howToVerify: "PSI Field LCP + Lab LCP element; preload hero image; avoid lazy-loading LCP media.",
  },
  30: {
    whyItMatters:
      "INP measures responsiveness to user input. It replaced FID as a Core Web Vital and affects page experience.",
    seoImpact: "critical",
    rankingEffect: "Direct CWV ranking signal (primarily field/CrUX).",
    howToVerify: "PSI Field INP; Chrome Performance panel long tasks; reduce heavy main-thread JS.",
  },
  31: {
    whyItMatters:
      "CLS measures visual stability. Unexpected shifts frustrate users and are a Core Web Vital ranking input.",
    seoImpact: "critical",
    rankingEffect: "Direct CWV ranking signal.",
    howToVerify: "PSI Field/Lab CLS; set width/height or aspect-ratio on images/embeds; reserve ad slots.",
  },
  32: {
    whyItMatters:
      "TBT approximates main-thread blocking in lab conditions and correlates with INP risk. It is a Lighthouse lab metric, not a field CWV.",
    seoImpact: "high",
    rankingEffect: "Indirect diagnostic for INP; not used directly as a ranking metric.",
    howToVerify: "Lighthouse TBT; code-split; defer third-party scripts.",
  },
  33: {
    whyItMatters:
      "Speed Index estimates how quickly above-the-fold content visually populates. Lab-only diagnostic.",
    seoImpact: "medium",
    rankingEffect: "Indirect; not a direct ranking factor.",
    howToVerify: "Lighthouse Speed Index; critical CSS; prioritize above-the-fold assets.",
  },
  44: {
    whyItMatters:
      "Security headers protect users and trust. HTTPS/HSTS matter for SEO; CSP/XFO are primarily security, with indirect trust benefits.",
    seoImpact: "medium",
    rankingEffect: "HTTPS is required for modern SEO; most other headers are security best practice.",
    howToVerify: "securityheaders.com or response header inspection.",
  },
};

export function getExplainer(checkpointId: number): CheckpointExplainer | undefined {
  return CHECKPOINT_EXPLAINERS[checkpointId];
}

export function enrichWithExplainer(
  checkpointId: number,
  status: CheckStatus,
  partial: {
    whyItMatters?: string;
    seoImpact?: SeoImpactLevel;
    howToVerify?: string;
    confidence?: FindingConfidence;
    rankingEffect?: string;
  } = {}
) {
  const explainer = getExplainer(checkpointId);
  const isFail = status === "fail" || status === "warn";
  return {
    whyItMatters: partial.whyItMatters || explainer?.whyItMatters,
    seoImpact: partial.seoImpact || explainer?.seoImpact || ("medium" as SeoImpactLevel),
    howToVerify: partial.howToVerify || explainer?.howToVerify,
    rankingEffect: partial.rankingEffect || explainer?.rankingEffect,
    confidence: partial.confidence || ("medium" as FindingConfidence),
    isGenuineSeoIssue: isFail ? true : false,
  };
}

export function priorityToImpact(priority: Priority): SeoImpactLevel {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}
