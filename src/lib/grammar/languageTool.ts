/**
 * Grammar / writing suggestions via LanguageTool.
 * Advisory only — never affects SEO audit scores.
 * https://languagetool.org/http-api/
 */

import { parseHtml, getTitle, getMetaContent, getH1Elements } from "@/lib/utils/html";
import type { CrawledPage, GrammarPageSuggestions, GrammarSuggestion } from "@/types/audit.types";
import { mapPool, readPositiveInt } from "@/lib/utils/asyncPool";

const PUBLIC_ENDPOINT = "https://api.languagetool.org/v2/check";
const MAX_CHARS = 12_000;

export function isGrammarEnabled(): boolean {
  const flag = process.env.ENABLE_GRAMMAR?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

/** True when a LanguageTool premium/key is configured (optional). */
export function hasLanguageToolKey(): boolean {
  return Boolean(process.env.LANGUAGETOOL_API_KEY?.trim());
}

export function getGrammarMaxPages(): number {
  return readPositiveInt(process.env.GRAMMAR_MAX_PAGES, 5, 40);
}

export function getGrammarConcurrency(): number {
  // Public LT API is stricter; with a key you can push higher
  const fallback = hasLanguageToolKey() ? 8 : 3;
  return readPositiveInt(process.env.GRAMMAR_CONCURRENCY, fallback, 15);
}

export function getGrammarLanguage(): string {
  return process.env.GRAMMAR_LANGUAGE?.trim() || "en-US";
}

function getEndpoint(): string {
  return process.env.LANGUAGETOOL_API_URL?.trim() || PUBLIC_ENDPOINT;
}

/** Extract title, meta, H1s, and main body copy for grammar review. */
export function extractCopyForGrammar(html: string): string {
  const $ = parseHtml(html);
  $("script, style, noscript, svg, nav, footer, header, iframe").remove();

  const parts: string[] = [];
  const title = getTitle($);
  if (title) parts.push(title);

  const desc = getMetaContent($, "description");
  if (desc) parts.push(desc);

  for (const h of getH1Elements($).slice(0, 5)) {
    if (h.text) parts.push(h.text);
  }

  $("main h2, main h3, article h2, article h3, main p, article p, main li, article li")
    .slice(0, 40)
    .each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t.length > 20) parts.push(t);
    });

  if (parts.length < 3) {
    const body = $("body").text().replace(/\s+/g, " ").trim();
    if (body) parts.push(body.slice(0, 4000));
  }

  const unique = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
  let text = unique.join("\n\n");
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
  return text;
}

interface LtMatch {
  message?: string;
  shortMessage?: string;
  offset?: number;
  length?: number;
  context?: { text?: string; offset?: number; length?: number };
  replacements?: { value?: string }[];
  rule?: { id?: string; description?: string; category?: { id?: string; name?: string } };
}

function mapMatches(matches: LtMatch[], limit = 25): GrammarSuggestion[] {
  const out: GrammarSuggestion[] = [];
  const seen = new Set<string>();

  for (const m of matches) {
    const message = (m.message || m.shortMessage || "").trim();
    if (!message) continue;
    const context = (m.context?.text || "").trim();
    const key = `${message}|${context}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const category = m.rule?.category?.id || m.rule?.category?.name || "";
    // Skip pure style preference noise when category is TYPOGRAPHY-only with no replacements? Keep most.
    out.push({
      message,
      shortMessage: m.shortMessage || undefined,
      context: context.slice(0, 220),
      replacements: (m.replacements || [])
        .map((r) => r.value || "")
        .filter(Boolean)
        .slice(0, 5),
      ruleId: m.rule?.id,
      category: category || undefined,
      offset: m.offset,
      length: m.length,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function checkGrammarText(text: string): Promise<{ suggestions: GrammarSuggestion[]; error?: string }> {
  if (!text.trim()) return { suggestions: [] };

  const endpoint = getEndpoint();
  const language = getGrammarLanguage();
  const apiKey = process.env.LANGUAGETOOL_API_KEY?.trim();
  const username = process.env.LANGUAGETOOL_USERNAME?.trim();

  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", language);
  body.set("enabledOnly", "false");
  // Focus on grammar/spelling/clarity — skip some niche categories
  body.set(
    "disabledCategories",
    "STYLE,REDUNDANCY,PLAIN_ENGLISH,WIKIPEDIA"
  );

  if (apiKey) body.set("apiKey", apiKey);
  if (username) body.set("username", username);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        suggestions: [],
        error: `LanguageTool HTTP ${res.status}: ${errText.slice(0, 160)}`,
      };
    }

    const data = (await res.json()) as { matches?: LtMatch[] };
    return { suggestions: mapMatches(data.matches || []) };
  } catch (err) {
    clearTimeout(timeout);
    return {
      suggestions: [],
      error: err instanceof Error ? err.message : "Grammar check failed",
    };
  }
}

export async function auditGrammarSuggestions(
  pages: CrawledPage[],
  options?: { maxPages?: number; onProgress?: (done: number, total: number, url: string) => void }
): Promise<{ pages: GrammarPageSuggestions[]; error?: string }> {
  if (!isGrammarEnabled()) return { pages: [] };

  const max = options?.maxPages ?? getGrammarMaxPages();
  const targets = pages
    .filter((p) => p.statusCode >= 200 && p.statusCode < 400 && p.html)
    .slice(0, max);

  let lastError: string | undefined;
  const concurrency = getGrammarConcurrency();

  const batch = await mapPool(
    targets,
    concurrency,
    async (page): Promise<GrammarPageSuggestions | null> => {
      const text = extractCopyForGrammar(page.html);
      const { suggestions, error } = await checkGrammarText(text);
      if (error) lastError = error;
      if (suggestions.length === 0) return null;
      return {
        url: page.finalUrl,
        suggestions,
        textSampleChars: text.length,
      };
    },
    (done, total, page) => options?.onProgress?.(done, total, page.finalUrl)
  );

  return {
    pages: batch.filter((p): p is GrammarPageSuggestions => Boolean(p)),
    error: lastError,
  };
}
