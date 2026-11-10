import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { SheetTrigger, SheetClose } from '@/components/overlay/Sheet';
import { EmptyState, Skeleton, StatusBadge, UnavailableState } from '@/components/feedback/States';
import { Sensitive } from '@/providers/PrivacyProvider';
import { rupiahSen } from '@/lib/utils/money';
import { TransactionFilters } from '@/features/transactions/components/TransactionFilters';
import { applyTxFilter, parseTxFilter, txFilterOptions } from '@/features/transactions/services/transactions';
import { getTransactions } from '@/features/transactions/services/transactions.server';

export const metadata: Metadata = { title: 'Transaksi' };
type Params = Record<string, string | string[] | undefined>;

async function TransactionList({ params }: { params: Params }) {
  const r = await getTransactions();
  if (r.state !== 'ok') return <UnavailableState what="Riwayat transaksi" compact={false} />;
  const filter = parseTxFilter(params);
  const items = applyTxFilter(r.data, filter);
  return (
    <>
      <TransactionFilters options={txFilterOptions(r.data)} count={items.length} />
      {r.data.length === 0 ? <EmptyState icon="history" title="Belum ada transaksi" action={<Link className="secondary" href="/belanja">Mulai belanja</Link>}>Pesanan toko dan layanan digitalmu akan tampil di sini.</EmptyState>
        : items.length === 0 ? <EmptyState icon="history" title="Tidak ada transaksi" action={<Link className="secondary" href="/transaksi" replace>Reset filter</Link>}>Tidak ada transaksi yang cocok dengan filter ini. Ubah pilihan atau reset filter.</EmptyState>
          : (
            <ul className="transaction-list" aria-label="Riwayat transaksi">
              {items.map((t) => (
                <li key={t.key}>
                  <SheetTrigger className="transaction" title={t.title} subtitle="Rincian transaksi" label={`Lihat rincian ${t.title}, ${t.date}, ${rupiahSen(t.amountSen)}, ${t.status}`}
                    content={<>
                      <dl className="dialog-values">
                        <div><dt>Transaksi</dt><dd>{t.title}</dd></div><div><dt>Tanggal</dt><dd>{t.date}</dd></div><div><dt>Keterangan</dt><dd>{t.reference}</dd></div>
                        {t.payment ? <div><dt>Pembayaran</dt><dd>{t.payment}</dd></div> : null}
                        <div><dt>Nominal</dt><dd><Sensitive>{rupiahSen(t.amountSen)}</Sensitive></dd></div><div><dt>Status</dt><dd>{t.status}</dd></div>
                      </dl>
                      <SheetClose>Kembali</SheetClose>
                    </>}>
                    <span className={`transaction-icon${t.kind === 'PPOB' ? ' yellow' : ''}`}><Icon name={t.kind === 'PPOB' ? 'bolt' : t.kind === 'Belanja Online' ? 'wifi' : 'store'} /></span>
                    <span className="transaction-main">
                      <span className="transaction-heading"><strong>{t.title}</strong><b><Sensitive>{rupiahSen(t.amountSen)}</Sensitive></b></span>
                      <span className="transaction-reference">{t.reference}</span>
                      <span className="transaction-footer"><span>{t.date}</span><StatusBadge tone={t.tone}>{t.status}</StatusBadge></span>
                    </span>
                  </SheetTrigger>
                </li>
              ))}
            </ul>
          )}
    </>
  );
}

export default async function TransaksiPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <Screen name="transaksi" nav>
      <PageHeader title="Transaksi" subtitle="Riwayat" back="/beranda" symbol="history" />
      <main id="main" className="content">
        <div className="intro"><div><h2>Riwayat transaksi</h2><p>Pesanan toko dan layanan digitalmu.</p></div><span className="example-label">60 terakhir</span></div>
        <Suspense fallback={<div aria-busy="true"><Skeleton height={110} /><Skeleton height={300} style={{ marginTop: 16 }} /></div>}><TransactionList params={params} /></Suspense>
      </main>
    </Screen>
  );
}
