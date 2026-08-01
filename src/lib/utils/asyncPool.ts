/**
 * Run async work over items with a fixed concurrency limit (batch parallel).
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number, item: T) => void
): Promise<R[]> {
  const total = items.length;
  if (total === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, total));
  const results = new Array<R>(total);
  let nextIndex = 0;
  let doneCount = 0;

  async function runOne(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= total) return;
      const item = items[index];
      results[index] = await worker(item, index);
      doneCount += 1;
      onProgress?.(doneCount, total, item);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runOne()));
  return results;
}

export function readPositiveInt(envValue: string | undefined, fallback: number, max: number): number {
  if (!envValue?.trim()) return fallback;
  const n = Number(envValue.trim());
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

/** Sliding-window rate limiter (e.g. 300 requests / 100 seconds). */
export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }
      const oldest = this.timestamps[0] ?? now;
      const waitMs = Math.max(50, this.windowMs - (now - oldest) + 25);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
