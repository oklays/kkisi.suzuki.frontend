'use client';

/** Console page failure: generic message only (server errors arrive as a digest), with a retry. */
export default function ConsoleError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section className="console-panel" role="alert">
      <h2>Halaman tidak dapat dimuat</h2>
      <p>Terjadi gangguan saat memuat data. Data Anda tidak berubah.</p>
      <button type="button" onClick={() => retry()}>Coba lagi</button>
    </section>
  );
}
