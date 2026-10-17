/** Shown on every Warehouse preview screen: the data is fictitious, nothing is connected, no action exists. */
export function PreviewBanner() {
  return (
    <p className="console-notice console-synthetic" role="note">
      <span><strong>DATA SINTETIS UNTUK PRATINJAU.</strong> Bukan data Gudang dan bukan stok TOKO: skema Gudang belum diperoleh dan tidak ada koneksi. Halaman ini hanya membaca; tidak ada aksi dispatch, penerimaan, atau posting stok, dan perlakuan akuntansi antar-entitas belum diputuskan pemilik.</span>
    </p>
  );
}
