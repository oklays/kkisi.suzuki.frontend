import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <div className="mark">KSM</div>
      <div className="content">
        <p className="eyebrow">KOPERASI SUZUKI MART · MIGRATION WORKSPACE</p>
        <h1>Fondasi aplikasi siap.</h1>
        <p className="description">
          Pratinjau POS / Kasir tersedia dengan data contoh. Autentikasi, stok,
          dan transaksi perlu diverifikasi sebelum terhubung ke data operasional.
        </p>
        <div className="notice" role="status">
          <span className="notice-dot" /> Tidak ada transaksi atau pembayaran aktif.
        </div>
        <p><Link href="/pos">Buka pratinjau POS / Kasir</Link></p>
      </div>
      <footer>KKISI · Implementasi bertahap, tanpa perubahan pada aplikasi PHP.</footer>
    </main>
  );
}
