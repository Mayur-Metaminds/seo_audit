# SEO Check — Metaminds

Technical SEO and page speed audit tool with **55 checkpoints** across crawlability, on-page signals, performance, assets, security, and E-E-A-T.

## Deploy to Vercel

### 1. Push to GitHub and import in Vercel

### 2. Add Upstash Redis (required)

Audits are stored in Redis and **auto-deleted after 30 minutes** (configurable via `AUDIT_TTL_MINUTES`).

1. Go to [Upstash](https://upstash.com) → Create Redis database
2. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**
3. Add to Vercel **Settings → Environment Variables** (or local `.env.local`)

```env
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
AUDIT_TTL_MINUTES=30
```

### 3. Deploy

Vercel Pro recommended (300s function timeout for full site crawls). `vercel.json` sets `maxDuration: 300`.

```bash
pnpm install
pnpm build
```

## Local Development

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Without Redis env vars, reports fall back to in-memory storage (local dev only) with the same TTL.

```bash
cp .env.example .env.local
# Add your Upstash keys to .env.local
pnpm install
pnpm dev
```

## API

```bash
# Start audit
curl -X POST https://your-app.vercel.app/api/audit \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Poll status
curl https://your-app.vercel.app/api/audit/{id}

# Export report
curl https://your-app.vercel.app/api/export/{id} -o report.md
```
