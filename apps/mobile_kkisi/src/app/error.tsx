'use client';
import { useOnline } from '@/hooks/browser-store';
import { Icon } from '@/components/ui/Icon';

// Whole-screen failure (configuration missing, session store down, unexpected error). Never shows internal details.
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = !useOnline();
  const notConfigured = error.message === 'NOT_CONFIGURED';
  return (
    <div className="app">
      <main id="main" className="content state-page">
        <div className="empty error" role="alert">
          <span className="empty-icon" aria-hidden="true"><Icon name={offline ? 'offline' : 'info'} /></span>
          <h1 style={{ fontSize: 18 }}>{offline ? 'Tidak ada koneksi' : notConfigured ? 'Layanan belum tersedia' : 'Halaman belum dapat dimuat'}</h1>
          <p>{offline ? 'Data anggota memerlukan koneksi internet. Sambungkan perangkat lalu coba lagi.'
            : notConfigured ? 'Aplikasi anggota belum selesai dikonfigurasi oleh pengelola. Silakan coba beberapa saat lagi.'
              : 'Terjadi gangguan saat mengambil data. Tidak ada data yang diubah.'}</p>
          <button type="button" className="primary" onClick={reset}>Coba lagi</button>
          {error.digest ? <p style={{ fontSize: 10, marginTop: 12 }}>Kode: {error.digest}</p> : null}
        </div>
      </main>
    </div>
  );
}
