export default function SalesLoading() {
  return <main className="sales-workspace" id="pos-workspace" aria-busy="true">
    <p className="sales-loading-label" role="status">Memuat riwayat transaksi…</p>
    <div className="sales-skeleton" aria-hidden="true"><div className="sales-skeleton-heading" /><div className="sales-skeleton-filters" />
      <div className="sales-skeleton-table">{Array.from({ length: 8 }, (_, index) => <div className="sales-skeleton-row" key={index}><span /><span /><span /><span /></div>)}</div>
    </div>
  </main>;
}
