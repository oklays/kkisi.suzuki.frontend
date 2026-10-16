import Link from 'next/link';

/** Unknown console record or page. Rendered inside the console shell; reveals nothing about whether a record exists elsewhere. */
export default function ConsoleNotFound() {
  return (
    <section className="console-panel" role="status">
      <h1>Data tidak ditemukan</h1>
      <p>Halaman atau data yang Anda cari tidak ada atau tidak dapat ditampilkan.</p>
      <Link href="/console">Kembali ke dashboard</Link>
    </section>
  );
}
