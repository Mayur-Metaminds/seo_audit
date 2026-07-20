import type { RobotsTxtInfo, SitemapInfo } from "@/types/audit.types";
import {
  fetchTextResource,
  isValidRobotsBody,
  isValidSitemapBody,
} from "./fetchPage";

const SITEMAP_FALLBACKS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/wp-sitemap.xml"];

interface RobotsGroup {
  userAgents: string[];
  disallows: string[];
  allows: string[];
}

function parseRobotsGroups(content: string): { groups: RobotsGroup[]; sitemaps: string[]; hasSyntaxIssues: boolean } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let hasSyntaxIssues = false;
  let current: RobotsGroup = { userAgents: [], disallows: [], allows: [] };

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      hasSyntaxIssues = true;
      continue;
    }

    const directive = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (directive === "sitemap") {
      sitemaps.push(value);
      continue;
    }

    if (directive === "user-agent") {
      if (current.userAgents.length > 0 || current.disallows.length > 0 || current.allows.length > 0) {
        groups.push(current);
      }
      current = { userAgents: [value.toLowerCase()], disallows: [], allows: [] };
    } else if (directive === "disallow") {
      current.disallows.push(value);
    } else if (directive === "allow") {
      current.allows.push(value);
    }
  }

  if (current.userAgents.length > 0 || current.disallows.length > 0 || current.allows.length > 0) {
    groups.push(current);
  }

  return { groups, sitemaps, hasSyntaxIssues };
}

function getApplicableGroup(groups: RobotsGroup[]): RobotsGroup | null {
  const botName = "metamindsseoaudit";
  const star = groups.find((g) => g.userAgents.includes("*"));
  const specific = groups.find(
    (g) => g.userAgents.some((ua) => botName.includes(ua.replace(/[^a-z0-9]/g, "")) || ua.includes("metaminds"))
  );
  return specific || star || groups[0] || null;
}

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsTxtInfo> {
  const origin = new URL(baseUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;

  try {
    const page = await fetchTextResource(robotsUrl);
    const content = page.html || "";
    const exists =
      page.statusCode === 200 &&
      content.length > 0 &&
      isValidRobotsBody(content, page.contentType || "");

    if (!exists) {
      return { exists: false, content: "", sitemaps: [], disallows: [], allows: [], hasSyntaxIssues: false };
    }

    const { groups, sitemaps, hasSyntaxIssues } = parseRobotsGroups(content);
    const group = getApplicableGroup(groups);

    return {
      exists,
      content,
      sitemaps,
      disallows: group?.disallows || [],
      allows: group?.allows || [],
      hasSyntaxIssues,
    };
  } catch {
    return { exists: false, content: "", sitemaps: [], disallows: [], allows: [], hasSyntaxIssues: true };
  }
}

async function fetchSingleSitemap(url: string, visited = new Set<string>()): Promise<SitemapInfo> {
  if (visited.has(url)) {
    return { exists: false, url, urls: [], urlCount: 0, hasLastmod: false, errors: ["Sitemap redirect loop"] };
  }
  visited.add(url);

  try {
    const page = await fetchTextResource(url);
    const body = page.html || "";

    if (page.statusCode !== 200 || !isValidSitemapBody(body, page.contentType || "")) {
      return {
        exists: false,
        url,
        urls: [],
        urlCount: 0,
        hasLastmod: false,
        errors: [`Invalid or missing sitemap at ${url} (HTTP ${page.statusCode})`],
      };
    }

    const urls: string[] = [];
    const errors: string[] = [];
    const hasLastmod = body.includes("<lastmod>");

    if (body.includes("<sitemapindex")) {
      const sitemapLocs = [...body.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi)].map((m) => m[1].trim());
      for (const loc of sitemapLocs) {
        const child = await fetchSingleSitemap(loc, visited);
        urls.push(...child.urls);
        errors.push(...child.errors);
      }
    } else {
      const locs = [...body.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi)].map((m) => m[1].trim());
      urls.push(...locs);
    }

    const unique = [...new Set(urls)];
    return { exists: true, url, urls: unique, urlCount: unique.length, hasLastmod, errors };
  } catch (error) {
    return {
      exists: false,
      url,
      urls: [],
      urlCount: 0,
      hasLastmod: false,
      errors: [error instanceof Error ? error.message : "Failed to fetch sitemap"],
    };
  }
}

export async function fetchSitemap(baseUrl: string, sitemapUrls?: string[]): Promise<SitemapInfo> {
  const origin = new URL(baseUrl).origin;
  const candidates = [
    ...(sitemapUrls || []),
    ...SITEMAP_FALLBACKS.map((p) => `${origin}${p}`),
  ];
  const tried = new Set<string>();

  const allUrls: string[] = [];
  const allErrors: string[] = [];
  let primaryUrl = "";
  let found = false;
  let hasLastmod = false;

  for (const candidate of candidates) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);

    const result = await fetchSingleSitemap(candidate);
    if (result.exists) {
      found = true;
      if (!primaryUrl) primaryUrl = result.url;
      allUrls.push(...result.urls);
      hasLastmod = hasLastmod || result.hasLastmod;
    } else {
      allErrors.push(...result.errors);
    }
  }

  const unique = [...new Set(allUrls)];
  return {
    exists: found,
    url: primaryUrl || `${origin}/sitemap.xml`,
    urls: unique,
    urlCount: unique.length,
    hasLastmod,
    errors: found ? allErrors : allErrors.length ? allErrors : ["No sitemap found at common paths"],
  };
}

export function isUrlBlockedByRobots(url: string, disallows: string[], allows: string[]): boolean {
  const path = new URL(url).pathname;

  for (const allow of allows) {
    if (allow === "/") return false;
    if (allow && path.startsWith(allow)) return false;
  }

  for (const disallow of disallows) {
    if (disallow === "/") return true;
    if (disallow && path.startsWith(disallow)) return true;
  }

  return false;
}
