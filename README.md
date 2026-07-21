# SEO Check — Metaminds

Technical SEO and page speed audit tool with **55 checkpoints** across crawlability, on-page signals, performance, assets, security, and E-E-A-T.

## How it works

1. Submit a URL — the API **streams live progress** (current URL, found / done / remaining, 0–100%).
2. **Custom server (default):** crawls **all** discovered pages — no chunking.
3. **Vercel:** set `AUDIT_MAX_PAGES=150` so the function finishes within the time limit.
4. If any URLs are left unaudited, the report shows a **Remaining Pages** list (copyable) plus Markdown/PDF export.
5. Report is kept in **memory + IndexedDB**; PDF/Markdown are generated in the browser.

```env
# Custom server — full crawl
AUDIT_MAX_PAGES=0

# Vercel — safe cap
# AUDIT_MAX_PAGES=150
```

No accounts or external storage required.

## Deploy to Vercel

1. Push to GitHub and import in Vercel
2. Deploy (no env vars required)

Vercel Pro is recommended for large sites (`maxDuration: 300` in `vercel.json`). Hobby plans have a shorter function timeout.

```bash
pnpm install
pnpm build
```

## Local Development

```bash
pnpm install
pnpm dev
```

## API

```bash
# Run audit (waits until complete — can take several minutes)
curl -X POST https://your-app.vercel.app/api/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' \
  -o report.json

# Export PDF (POST the report JSON body)
curl -X POST "https://your-app.vercel.app/api/export?format=pdf" \
  -H "Content-Type: application/json" \
  -d @report.json \
  -o report.pdf
```

## Accuracy Notes

- Some Core Web Vitals checks use **page-weight proxies**, not full Lighthouse lab data.
- GSC / Bing Webmaster checks are marked **manual** (not scored as fails).
- Compression detection may be marked manual because Node `fetch` auto-decompresses responses.
