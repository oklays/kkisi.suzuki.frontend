'use client';

export default function KosipaError({ reset }: { reset: () => void }) {
  return <section className="console-panel kosipa-action-error" role="alert"><h1>Halaman KOSIPA belum dapat dimuat</h1><p>Data tidak ditampilkan. Coba kembali setelah layanan pulih.</p><button type="button" onClick={reset}>Coba lagi</button></section>;
}
