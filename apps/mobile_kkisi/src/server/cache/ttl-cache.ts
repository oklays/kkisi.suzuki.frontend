// In-process read cache (P2). Server memory only: nothing here ever reaches the browser, the service worker or a shared cache.
// - TTL per cache, bounded size (oldest entries evicted first), single-flight: concurrent misses for one key share ONE database read.
// - Failed loads are never cached (the next request retries).
// - Only for data that changes rarely or is immutable once published; balances, loans in progress and anything a member just submitted
//   are never cached (see cached-reads.ts for the list and the TTL of each).

export type CacheStats = { name: string; ttlMs: number; size: number; max: number; hits: number; misses: number; loads: number; errors: number };

type Entry<V> = { value: V; expires: number };

export class TtlCache<V> {
  readonly name: string;
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private hits = 0; private misses = 0; private loads = 0; private errors = 0;

  constructor(name: string, ttlMs: number, max = 2000) {
    if (!Number.isInteger(ttlMs) || ttlMs <= 0 || !Number.isInteger(max) || max <= 0) throw new RangeError('CACHE_CONFIG');
    this.name = name; this.ttlMs = ttlMs; this.max = max;
  }

  async get(key: string, load: () => Promise<V>, now: number = Date.now()): Promise<V> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > now) { this.hits++; return hit.value; }
    this.misses++;
    if (hit) this.entries.delete(key);
    const running = this.inflight.get(key);
    if (running) return running;
    const p = (async () => {
      this.loads++;
      try {
        const value = await load();
        if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value as string);
        this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
        return value;
      } catch (e) { this.errors++; throw e; } finally { this.inflight.delete(key); }
    })();
    this.inflight.set(key, p);
    return p;
  }

  delete(key: string): void { this.entries.delete(key); }
  clear(): void { this.entries.clear(); }
  stats(): CacheStats { return { name: this.name, ttlMs: this.ttlMs, size: this.entries.size, max: this.max, hits: this.hits, misses: this.misses, loads: this.loads, errors: this.errors }; }
}

const g = globalThis as typeof globalThis & { __kkisiMobileCaches?: Map<string, TtlCache<unknown>> };

/** One cache per name per process (Next may evaluate this module in several module graphs). */
export function namedCache<V>(name: string, ttlMs: number, max?: number): TtlCache<V> {
  g.__kkisiMobileCaches ??= new Map();
  let c = g.__kkisiMobileCaches.get(name) as TtlCache<V> | undefined;
  if (!c) { c = new TtlCache<V>(name, ttlMs, max); g.__kkisiMobileCaches.set(name, c as TtlCache<unknown>); }
  return c;
}

export const allCacheStats = (): CacheStats[] => [...(g.__kkisiMobileCaches?.values() ?? [])].map((c) => c.stats());
