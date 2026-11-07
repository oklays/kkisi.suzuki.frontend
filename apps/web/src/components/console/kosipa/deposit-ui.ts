/** Messages of the savings deposit screens (FA-03C T07). The server enforces every rule; these only explain its codes. */
export const DEPOSIT_MESSAGES: Record<string, string> = {
  SAVINGS_DATE_INVALID: 'Tanggal setoran harus di bulan berjalan dan tidak boleh melewati hari ini.',
  SAVINGS_AMOUNT_INVALID: 'Nominal harus lebih dari 0, maksimal 2 digit desimal.',
  SAVINGS_FIELD_INVALID: 'Isian tidak valid: metode CASH/TRANSFER; bank dan no. rekening hanya untuk transfer; keterangan maksimal 50 karakter.',
  SAVINGS_MEMBER_INACTIVE: 'Anggota sudah keluar (RESIGN/PENSIUN); setoran tidak dapat dibuat.',
  SAVINGS_NIK_TOO_LONG: 'NIK anggota lebih dari 10 karakter sehingga tidak muat di kolom simpanan. Hubungi administrator.',
  SAVINGS_PRODUCT_INACTIVE: 'Produk Simpanan Sukarela tidak aktif di master jenis simpanan.',
  SAVINGS_MAKER_CHECKER: 'Setoran ini Anda buat sendiri. Persetujuan harus oleh petugas lain.',
  SAVINGS_STATUS_INVALID: 'Setoran ini sudah diproses (disetujui atau ditolak). Muat ulang halaman.',
  SAVINGS_LINES_INVALID: 'Baris setoran tidak konsisten (dari layar lama). Periksa di KOSIPA.',
  SAVINGS_NOT_A_DEPOSIT: 'Dokumen ini bukan setoran tunai/transfer.',
  SAVINGS_DOC_NOT_FOUND: 'Setoran tidak ditemukan. Muat ulang halaman.',
  MEMBER_NOT_FOUND: 'Anggota dengan NIK itu tidak ditemukan, atau NIK-nya ganda di data lama.',
  NIK_INVALID: 'NIK hanya huruf dan angka, maksimal 20 karakter.',
  STALE: 'Setoran ini baru saja berubah (oleh orang lain atau layar lama). Muat ulang halaman lalu ulangi.',
  REASON_INVALID: 'Alasan wajib diisi (5–200 karakter).',
  FORBIDDEN: 'Akun Anda tidak berwenang untuk tindakan ini.',
  WRITE_DISABLED: 'Setoran simpanan belum diaktifkan di lingkungan ini. Tidak ada yang disimpan.',
  WRITE_NOT_CONFIGURED: 'Penulisan simpanan belum dikonfigurasi di lingkungan ini. Tidak ada yang disimpan.',
  LEGACY_ACTIVE: 'Layar Setor Simpanan di KOSIPA lama aktif kembali, jadi perubahan di sini ditolak. Hubungi operator.',
  BUSY_RETRY: 'Sistem sedang sibuk. Coba lagi; permintaan yang sama tidak akan tercatat dua kali.',
  IDEMPOTENCY_CONFLICT: 'Permintaan bentrok dengan pengiriman sebelumnya. Muat ulang halaman lalu ulangi.',
  NETWORK: 'Koneksi terputus. Coba lagi; permintaan yang sama tidak akan tercatat dua kali.',
};
export const DEPOSIT_RETRY_SAME_KEY = new Set(['BUSY_RETRY', 'NETWORK', 'KOSIPA_UNAVAILABLE']);
/** '125000.5' -> 'Rp125.000,50'. Display only. */
export const rupiah = (canonical: string) => {
  if (!/^\d+(\.\d+)?$/.test(canonical)) return '—';
  const [w, f = ''] = canonical.split('.');
  return `Rp${w.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${f ? `,${(f + '0').slice(0, 2)}` : ''}`;
};
export async function postJson(path: string, csrfToken: string, body: unknown): Promise<{ ok: boolean; code: string; data: unknown }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, cache: 'no-store', body: JSON.stringify(body) });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, code: typeof json.error === 'string' ? json.error : '', data: json.data ?? json };
  } catch { return { ok: false, code: 'NETWORK', data: null }; }
}
