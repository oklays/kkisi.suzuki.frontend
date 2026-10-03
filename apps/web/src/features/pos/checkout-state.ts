import type { PosSession, PreviewPayment } from './types.ts';

/** Keep the button and its explanations governed by the same conditions. */
export function checkoutBlockingReasons({ session, payment, itemCount, totalSen, paidSen, remainingSen }: {
  session: Pick<PosSession, 'checkoutAvailable' | 'register'>; payment: PreviewPayment;
  itemCount: number; totalSen: number; paidSen: number; remainingSen: number | null;
}): string[] {
  const reasons: string[] = [];
  if (!session.checkoutAvailable) reasons.push('Pembayaran belum diaktifkan untuk lingkungan ini. Hubungi pengelola.');
  if (session.register.multiple) reasons.push('Ada lebih dari satu sesi kasir terbuka untuk akun dan cabang ini. Tutup sesi lama di aplikasi kasir yang aktif.');
  if (!session.register.open) reasons.push('Buka sesi kasir hari ini untuk akun dan cabang ini di aplikasi kasir yang aktif.');
  else if (session.register.open.stale) reasons.push(`Sesi kasir tanggal ${session.register.open.openedOn} sudah kedaluwarsa. Tutup sesi lama dan buka sesi hari ini.`);
  if (itemCount < 1 || totalSen <= 0) reasons.push('Tambahkan produk dengan harga valid ke keranjang.');
  else if (payment === 'Cash' && paidSen < totalSen) reasons.push('Uang bayar harus sama dengan atau lebih besar dari total pembayaran.');
  else if (payment === 'Kredit' && remainingSen === null) reasons.push('Pilih anggota aktif untuk pembayaran Kredit.');
  else if (payment === 'Kredit' && remainingSen! < totalSen) reasons.push('Sisa limit anggota tidak mencukupi.');
  return reasons;
}

/** A cart reset invalidates all its pending scans, without discarding consecutive scans in the same cart. */
export function createCartScanGuard() {
  let generation = 0;
  return {
    capture: () => generation,
    invalidate: () => { generation++; },
    isCurrent: (scanGeneration: number) => scanGeneration === generation,
  };
}
