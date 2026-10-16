/** Skeleton while a console page loads; never shows numbers. */
export default function ConsoleLoading() {
  return (
    <div className="console-page" aria-busy="true" aria-live="polite">
      <span className="console-visually-hidden">Memuat…</span>
      <div className="console-skeleton console-skeleton-title" />
      <div className="console-skeleton-grid">{[0, 1, 2].map((i) => <div key={i} className="console-skeleton console-skeleton-card" />)}</div>
    </div>
  );
}
