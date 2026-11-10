// Browser-side JSON client for this app's own endpoints (same origin only). Normalises every outcome to a code so screens map
// codes to Indonesian messages; it never logs request bodies (they can hold passwords or PINs).
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; code: string; retryAfterSec?: number; remaining?: number };

export async function postJson<T>(path: string, body: unknown, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  if (!path.startsWith('/api/')) throw new Error('same-origin API paths only');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.ok) return { ok: true, status: res.status, data: json as T };
    return { ok: false, status: res.status, code: typeof json.error === 'string' ? json.error : 'UNAVAILABLE', retryAfterSec: typeof json.retryAfterSec === 'number' ? json.retryAfterSec : undefined, remaining: typeof json.remaining === 'number' ? json.remaining : undefined };
  } catch {
    return { ok: false, status: 0, code: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : controller.signal.aborted ? 'TIMEOUT' : 'NETWORK' };
  } finally { clearTimeout(timer); }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  if (!path.startsWith('/api/')) throw new Error('same-origin API paths only');
  try {
    const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    return res.ok ? { ok: true, status: res.status, data: json as T } : { ok: false, status: res.status, code: typeof json.error === 'string' ? json.error : 'UNAVAILABLE' };
  } catch {
    return { ok: false, status: 0, code: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'NETWORK' };
  }
}

/** Shared wording for transport/service outcomes. */
export function commonMessage(code: string, retryAfterSec?: number): string {
  switch (code) {
    case 'OFFLINE': return 'Tidak ada koneksi internet. Sambungkan perangkat lalu coba lagi.';
    case 'TIMEOUT': case 'NETWORK': return 'Koneksi ke koperasi terputus. Coba lagi.';
    case 'THROTTLED': return `Terlalu banyak percobaan. Coba lagi dalam ${Math.max(1, Math.ceil((retryAfterSec ?? 60) / 60))} menit.`;
    case 'NOT_CONFIGURED': return 'Layanan masuk belum tersedia. Silakan coba beberapa saat lagi.';
    case 'CSRF': return 'Halaman ini sudah kedaluwarsa. Muat ulang halaman lalu coba lagi.';
    case 'BUSY': case 'UNAVAILABLE': default: return 'Layanan sedang sibuk. Coba lagi sebentar lagi.';
  }
}
