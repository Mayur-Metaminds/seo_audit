/**
 * Smoke-test headless render + PSI for one URL.
 * Run: pnpm exec tsx scripts/smoke-accuracy.ts
 */
import { renderPageHtml, closeRenderBrowser } from "../src/lib/crawler/renderPage";
import { fetchPageSpeedMetrics } from "../src/lib/performance/pagespeed";
import { parseHtml, getH1Elements } from "../src/lib/utils/html";
import { auditPerformance } from "../src/lib/performance/auditPerformance";
import type { CrawledPage } from "../src/types/audit.types";

const URL = process.argv[2] || "https://astrovistaar.com/blogs/why-successful-people-often-wear-black-1";

async function main() {
  console.log("URL:", URL);

  const raw = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MetamindsSEOCheck)" },
  });
  const rawHtml = await raw.text();
  const rawH1 = getH1Elements(parseHtml(rawHtml));
  console.log("\n[Raw HTML] H1 count:", rawH1.length);
  rawH1.forEach((h, i) => console.log(`  ${i + 1}. ${h.isVisuallyHidden ? "[hidden]" : "[vis]"} ${h.text}`));

  console.log("\n[Headless] rendering...");
  const rendered = await renderPageHtml(URL);
  console.log(" rendered:", rendered.rendered, "ms:", rendered.renderMs, rendered.error || "");
  if (rendered.html) {
    const rh1 = getH1Elements(parseHtml(rendered.html));
    console.log(" H1 count after render:", rh1.length);
  }
  await closeRenderBrowser();

  console.log("\n[PSI] fetching Google PageSpeed Insights...");
  const lab = await fetchPageSpeedMetrics(URL, "mobile");
  if (lab.fetchError) {
    console.log(" PSI error:", lab.fetchError);
  } else {
    console.log(" Performance score:", lab.performanceScore);
    console.log(" Lab LCP/FCP/CLS/TBT:", lab.lcpMs, lab.fcpMs, lab.cls, lab.tbtMs);
    console.log(" Field LCP/INP/CLS:", lab.field.lcpMs, lab.field.inpMs, lab.field.cls);
    console.log(" Opportunities:", lab.opportunities.slice(0, 3).map((o) => o.title));
  }

  const page: CrawledPage = {
    url: URL,
    finalUrl: URL,
    statusCode: 200,
    html: rendered.html || rawHtml,
    rawHtml,
    rendered: rendered.rendered,
    renderMs: rendered.renderMs,
    headers: {},
    responseTimeMs: 0,
    ttfbMs: lab.ttfbMs || 0,
    contentLength: Buffer.byteLength(rendered.html || rawHtml, "utf8"),
    redirectChain: [],
    redirectStatuses: [],
    contentType: "text/html",
    labMetrics: lab.fetchError ? undefined : lab,
  };

  const perf = auditPerformance(page);
  console.log("\n[Perf checks]");
  for (const c of perf) {
    console.log(`  #${c.checkpointId} ${c.status} (${c.confidence}) ${c.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
