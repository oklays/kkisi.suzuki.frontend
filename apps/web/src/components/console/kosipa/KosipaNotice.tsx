import type { KosipaAccessState } from '@koperasi/application/console/capabilities';

const TEXT: Record<KosipaAccessState | 'no-capability', { title: string; text: string }> = {
  disabled: { title: 'Modul KOSIPA belum diaktifkan', text: 'Integrasi KOSIPA (baca saja) belum diaktifkan di lingkungan ini.' },
  unlinked: { title: 'Akun belum ditautkan ke KOSIPA', text: 'Akun console Anda belum ditautkan ke akun KOSIPA. Minta administrator untuk menautkannya.' },
  unavailable: { title: 'Layanan KOSIPA tidak tersedia', text: 'Akses KOSIPA sementara tidak dapat diperiksa. Data tidak ditampilkan sampai layanan pulih.' },
  linked: { title: 'Akses ditolak', text: 'Akun KOSIPA Anda tidak memiliki akses ke halaman ini.' },
  'no-capability': { title: 'Akses ditolak', text: 'Akun Anda tidak memiliki akses ke halaman ini.' },
};

/** Explains why KOSIPA content is not shown, without revealing anything about other accounts. */
export function KosipaNotice({ state }: { state: KosipaAccessState | 'no-capability' }) {
  const t = TEXT[state];
  return <section className="console-panel" role="status"><h1>{t.title}</h1><p>{t.text}</p></section>;
}
