import { formatRupiah } from '../../money/format.ts';

/** Format a source decimal as text; never route financial decimals through a floating-point number. */
export function formatExactRupiah(value: string | null): string {
  return formatRupiah(value, { placeholder: 'Tidak tersedia' });
}

export function maskIdentifier(value: string): string {
  return !value ? 'Tidak tersedia' : value.length <= 4 ? '••••' : `•••• ${value.slice(-4)}`;
}

export function exportFeedback(status: number): string {
  if (status === 401 || status === 403) return 'Akun ini tidak memiliki izin ekspor saat ini. Muat ulang halaman untuk memeriksa akses.';
  if (status === 413) return 'Data melebihi batas ekspor. Persempit filter lalu coba lagi.';
  if (status === 429) return 'Batas unduhan sementara tercapai. Tunggu sebelum mencoba lagi.';
  if (status === 0) return 'Unduhan terhenti. Periksa koneksi lalu coba lagi.';
  return 'Ekspor belum dapat diproses. Coba lagi setelah layanan pulih.';
}

/** Only these existing presentation routes accept private search POSTs. Business parsers still validate their inputs. */
export function privateSearchTarget(path: string): { kind: 'members' | 'savings' | 'loans' | 'loanProduct' | 'settlements' | 'rollovers' | 'batch' | 'reconciliation'; docNo?: string; product?: string } | null {
  if (path === '/console/kosipa/anggota') return { kind: 'members' };
  if (path === '/console/kosipa/simpanan') return { kind: 'savings' };
  if (path === '/console/kosipa/pinjaman' || path === '/console/kosipa/pinjaman/daftar') return { kind: 'loans' };
  if (path === '/console/kosipa/pinjaman/pelunasan') return { kind: 'settlements' };
  if (path === '/console/kosipa/pinjaman/roll-over') return { kind: 'rollovers' };
  const product = /^\/console\/kosipa\/pinjaman\/produk\/([a-z-]{3,20})$/.exec(path);
  if (product) return { kind: 'loanProduct', product: product[1] };
  const match = /^\/console\/kosipa\/payroll\/([A-Za-z0-9_-]{1,64})(\/rekonsiliasi)?$/.exec(path);
  return match ? { kind: match[2] ? 'reconciliation' : 'batch', docNo: match[1] } : null;
}

/** Environment label only; this grants no access and exposes no connection details. */
export function syntheticKosipaEnvironment(env: Record<string, string | undefined>): boolean {
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1') return false;
    // DEV LOCAL, or the isolated FA-01 write-foundation stack (integration/kosipa-full-access).
    return (url.port === '3307' && url.pathname === '/kkisi_devlocal_staging') || (url.port === '3322' && url.pathname === '/kkisi_kfa_synthetic');
  } catch { return false; }
}

/** Label for the local COPY of production (kkisi-staging, owner-approved write testing). It is real-data-derived but never production. */
export function localStagingReplicaEnvironment(env: Record<string, string | undefined>): boolean {
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    return env.KOSIPA_LOCAL_STAGING_WRITES === 'true' && env.APP_ENV !== 'production' && url.protocol === 'mysql:' && url.hostname === '127.0.0.1' && url.port === '3307' && url.pathname === '/kkisi_staging';
  } catch { return false; }
}

/** Database name shown in the replica banner, read from the configured DSN (never hardcoded). */
export function replicaDatabaseName(env: Record<string, string | undefined>): string {
  try { return decodeURIComponent(new URL(env.DATABASE_URL ?? '').pathname.slice(1)); } catch { return ''; }
}

/** Label sensitive production-derived UAT reads separately from synthetic write testing. */
export function readOnlyKosipaUatEnvironment(env: Record<string, string | undefined>): boolean {
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    return env.KOSIPA_UAT_READ_ONLY === 'true' && url.protocol === 'mysql:' && url.hostname === '127.0.0.1' && url.port === '3307' && url.pathname === '/kkisi_kosipa_read_uat';
  } catch { return false; }
}
