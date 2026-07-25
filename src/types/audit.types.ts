export type CheckStatus = "pass" | "warn" | "fail" | "na" | "manual";
export type Priority = "critical" | "high" | "medium" | "low";
export type AuditCategory =
  | "crawlability"
  | "on-page"
  | "architecture"
  | "page-speed"
  | "assets"
  | "security"
  | "eeat";

export interface FrameworkCheckpoint {
  id: number;
  category: AuditCategory;
  name: string;
  description: string;
  priority: Priority;
  tools: string;
  maxScore: number;
  codeLocation?: string;
  issueCode?: string;
  suggestion?: string;
  solutionCode?: string;
}

export interface CheckResult {
  checkpointId: number;
  status: CheckStatus;
  score: number;
  maxScore: number;
  message: string;
  recommendation?: string;
  evidence?: string[];
  affectedUrls?: string[];
  scope: "site" | "page";
  codeLocation?: string;
  issueCode?: string;
  suggestion?: string;
  solutionCode?: string;
}

export interface PageAuditResult {
  url: string;
  statusCode: number;
  responseTimeMs: number;
  pageSizeBytes: number;
  checks: CheckResult[];
  score: number;
  issues: string[];
}

export interface CategoryScore {
  category: AuditCategory;
  label: string;
  score: number;
  maxScore: number;
  percentage: number;
  checks: CheckResult[];
}

export interface AuditReport {
  id: string;
  url: string;
  domain: string;
  startedAt: string;
  completedAt?: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: {
    phase: string;
    current: number;
    total: number;
    message: string;
  };
  config: AuditConfig;
  pagesAudited: number;
  totalPagesFound: number;
  /** URLs discovered but not crawled/audited yet (empty when full crawl finishes). */
  remainingUrls: string[];
  pageResults: PageAuditResult[];
  siteChecks: CheckResult[];
  categoryScores: CategoryScore[];
  overallScore: number;
  maxScore: number;
  grade: "elite" | "good" | "needs-work" | "critical";
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    manual: number;
    topIssues: string[];
    strengths: string[];
  };
  error?: string;
}

export interface AuditConfig {
  maxPages: number;
  includeSubdomains: boolean;
  followExternalLinks: boolean;
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  statusCode: number;
  html: string;
  headers: Record<string, string>;
  responseTimeMs: number;
  ttfbMs: number;
  contentLength: number;
  redirectChain: string[];
  redirectStatuses: number[];
  contentType: string;
  error?: string;
}

export interface RobotsTxtInfo {
  exists: boolean;
  content: string;
  sitemaps: string[];
  disallows: string[];
  allows: string[];
  hasSyntaxIssues: boolean;
}

export interface SitemapInfo {
  exists: boolean;
  url: string;
  urls: string[];
  urlCount: number;
  hasLastmod: boolean;
  errors: string[];
}

export interface StartAuditRequest {
  url: string;
  maxPages?: number;
}
