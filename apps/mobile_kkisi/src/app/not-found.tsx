import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export default function NotFound() {
  return (
    <div className="app">
      <main id="main" className="content state-page">
        <div className="empty">
          <span className="empty-icon" aria-hidden="true"><Icon name="info" /></span>
          <h1 style={{ fontSize: 18 }}>Halaman tidak ditemukan</h1>
          <p>Alamat ini tidak ada di aplikasi anggota.</p>
          <Link className="primary" href="/beranda">Kembali ke beranda</Link>
        </div>
      </main>
    </div>
  );
}
