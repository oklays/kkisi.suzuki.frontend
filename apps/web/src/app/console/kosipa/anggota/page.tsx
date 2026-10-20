import { KosipaPageHeader, FeedbackState, StatusBadge, FinancialTable, SearchGuidance } from '@/components/console/kosipa/KosipaUI';
import { maskIdentifier } from '@/components/console/kosipa/presentation';
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
      <KosipaPageHeader title={<> Keanggotaan </>}>
        <p>Temukan anggota dan telusuri profil, simpanan, pinjaman, serta potongan yang boleh Anda lihat.</p>
      </KosipaPageHeader>
      <form className="console-search" action="/console/kosipa/anggota" method="post" data-kosipa-private role="search">
        <label htmlFor="member-q">NIK atau nama anggota</label>
        <div><input id="member-q" name="q" placeholder="NIK atau nama anggota" defaultValue={q} minLength={2} maxLength={50} autoComplete="off" required /><button type="submit"><Search size={16} aria-hidden="true" />Cari anggota</button><button type="submit" name="_reset" value="1" formNoValidate>Reset filter</button></div>
      </form>
      {!q && !failed && <SearchGuidance />}
      {failed && <FeedbackState kind="error" title={<> Pencarian gagal </>} reset="/console/kosipa/anggota"><p>Data anggota tidak dapat dibaca saat ini. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {!failed && q && results === null && <p className="console-notice">Masukkan minimal 2 karakter.</p>}
      {!failed && results && results.length === 0 && <FeedbackState kind="empty" title={<> Anggota tidak ditemukan </>} reset="/console/kosipa/anggota"><p>Tidak ada anggota yang cocok dengan “{q}”.</p></FeedbackState>}
      {!failed && results && results.length > 0 && (
        <section aria-label="Hasil pencarian" className="console-section">
          <h2>Hasil pencarian <span className="kosipa-result-count">{results.length} anggota{results.length >= 25 ? ' pertama' : ''}</span></h2>
          <FinancialTable label="Hasil pencarian anggota" columns={[{ label: "NIK tersamar" }, { label: "Nama" }, { label: "Grup" }, { label: "Status" }, { label: "Karyawan" }, { label: "Profil" }]}>
            <tbody>{results.map((m) => (
              <tr key={m.id}><td>{maskIdentifier(m.nik)}</td><td>{m.name || '—'}</td><td>{m.group ?? '—'}</td><td><StatusBadge value={m.status} /></td><td>{m.employment ?? '—'}</td><td><Link prefetch={false} href={`/console/kosipa/anggota/${m.id}`}>Lihat profil<span className="console-visually-hidden"> {m.name}</span></Link></td></tr>
            ))}</tbody>
          </FinancialTable>
          {results.length >= 25 && <p className="console-notice">Menampilkan 25 hasil pertama. Perjelas pencarian untuk hasil yang lebih spesifik.</p>}
        </section>
      )}
    </div>
  );
}
