import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Search } from 'lucide-react';
import { searchMembers, type MemberSummary } from '@koperasi/application/kosipa/member-360';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keanggotaan · KOSIPA · KKISI TB2' };

export default async function MemberSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/anggota' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const raw = (await searchParams).q;
  const q = typeof raw === 'string' ? raw.slice(0, 50) : '';
  let results: MemberSummary[] | null = null;
  let failed = false;
  try { results = q ? await searchMembers(services.members, auth.capabilities, q) : null; } catch { failed = true; }

  return (
    <div className="console-page">
      <header className="console-page-head">
        <h1>Keanggotaan</h1>
        <p>Cari anggota berdasarkan NIK atau nama. Data dibaca langsung dari KOSIPA (baca saja).</p>
      </header>
      <form className="console-search" action="/console/kosipa/anggota" method="get" role="search">
        <label htmlFor="member-q">NIK atau nama anggota</label>
        <div><input id="member-q" name="q" defaultValue={q} minLength={2} maxLength={50} autoComplete="off" required /><button type="submit"><Search size={16} aria-hidden="true" />Cari</button></div>
      </form>
      {failed && <section className="console-panel" role="alert"><h2>Pencarian gagal</h2><p>Data anggota tidak dapat dibaca saat ini. Coba lagi beberapa saat lagi.</p></section>}
      {!failed && q && results === null && <p className="console-notice">Masukkan minimal 2 karakter.</p>}
      {!failed && results && results.length === 0 && <section className="console-panel" role="status"><h2>Anggota tidak ditemukan</h2><p>Tidak ada anggota yang cocok dengan “{q}”.</p></section>}
      {!failed && results && results.length > 0 && (
        <section aria-label="Hasil pencarian" className="console-section">
          <table className="console-table">
            <thead><tr><th scope="col">NIK</th><th scope="col">Nama</th><th scope="col">Grup</th><th scope="col">Status</th><th scope="col">Karyawan</th></tr></thead>
            <tbody>{results.map((m) => (
              <tr key={m.id}><td><Link href={`/console/kosipa/anggota/${m.id}`}>{m.nik || '—'}</Link></td><td>{m.name || '—'}</td><td>{m.group ?? '—'}</td><td>{m.status ?? '—'}</td><td>{m.employment ?? '—'}</td></tr>
            ))}</tbody>
          </table>
          {results.length >= 25 && <p className="console-notice">Menampilkan 25 hasil pertama. Perjelas pencarian untuk hasil yang lebih spesifik.</p>}
        </section>
      )}
    </div>
  );
}
