import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readPayrollMember, type MemberInBatch } from '@koperasi/application/kosipa/payroll';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, formatLegacyDate, REASON_TEXT, STATUS_LABEL } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Potongan Anggota · Payroll · KKISI TB2' };

export default async function PayrollMemberPage({ params }: { params: Promise<{ docNo: string; nik: string }> }) {
  if (!consoleEnabled()) notFound();
  const { docNo, nik } = await params;
  const auth = await requireConsoleSession({ next: `/console/kosipa/payroll/${encodeURIComponent(docNo)}/anggota/${encodeURIComponent(nik)}` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.payroll.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let member: MemberInBatch | null = null; let failed = false;
  try {
    member = await readPayrollMember({ reader: services.payroll, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, { docNo, nik });
  } catch (error) { if (error instanceof KosipaError) notFound(); failed = true; }
  if (!failed && !member) notFound();
  const back = `/console/kosipa/payroll/${encodeURIComponent(docNo)}`;

  return (
    <div className="console-page">
      <Link className="console-back" href={back}><ArrowLeft size={16} aria-hidden="true" />Kembali ke batch {docNo}</Link>
      <header className="console-page-head"><h1>Potongan anggota</h1><p>{member ? `NIK ${member.nik} · ${STATUS_LABEL[member.header.status]}` : 'Data payroll KOSIPA, baca saja.'}</p></header>
      {failed && <section className="console-panel" role="alert"><h2>Data tidak dapat dibaca</h2><p>Data tidak tersedia saat ini. Coba lagi beberapa saat lagi.</p></section>}
      {member && (<>
        {member.duplicateRows && <p className="console-notice" role="status">Anggota ini memiliki lebih dari satu baris di batch yang sama. Setiap baris ditampilkan terpisah, tidak digabung.</p>}
        {member.rows.map((row, index) => (
          <section className="console-card" key={row.id} aria-labelledby={`sec-row-${row.id}`}>
            <h2 id={`sec-row-${row.id}`}>{member!.duplicateRows ? `Baris ${index + 1}: ` : ''}{row.name || 'Anggota'} · total tercatat {formatAmount4(row.breakdown.recordedTotal4)}</h2>
            <table className="console-table">
              <thead><tr><th scope="col">Komponen</th><th scope="col">Kelompok</th><th scope="col">Jumlah tercatat</th></tr></thead>
              <tbody>
                {row.breakdown.components.length === 0 ? <tr><td colSpan={3}>Tidak ada komponen bernilai.</td></tr> : row.breakdown.components.map((c) => <tr key={c.column}><td>{c.label}</td><td>{row.breakdown.groups.find((g) => g.group === c.group)?.label ?? c.group}</td><td className="num">{formatAmount4(c.amount4)}</td></tr>)}
                <tr><th scope="row" colSpan={2}>Jumlah komponen</th><td className="num">{formatAmount4(row.breakdown.componentSum4)}</td></tr>
                <tr><th scope="row" colSpan={2}>Total potongan tercatat</th><td className="num">{formatAmount4(row.breakdown.recordedTotal4)}</td></tr>
              </tbody>
            </table>
            {!row.breakdown.sumMatchesTotal && <p className="console-notice">Jumlah komponen berbeda dari total tercatat sebesar {formatAmount4(row.breakdown.differenceFromTotal4)}; nilai tercatat tidak diubah.</p>}
          </section>
        ))}

        {member.installments.state !== 'restricted' && (
          <section className="console-card" aria-labelledby="sec-angsuran">
            <h2 id="sec-angsuran">Referensi angsuran pinjaman (baca saja)</h2>
            {member.installments.state === 'unavailable' ? <p className="console-unavailable" role="status">{REASON_TEXT[member.installments.reason] ?? 'Tidak tersedia.'}</p> : (<>
              <p className="console-notice">Angsuran yang jatuh tempo {member.installments.data.window.from} s/d sebelum {member.installments.data.window.toExclusive}. Ini referensi, bukan perhitungan ulang potongan.</p>
              {member.installments.data.items.length === 0 ? <p>Tidak ada angsuran jatuh tempo pada bulan ini.</p> : (
                <table className="console-table">
                  <thead><tr><th scope="col">Pinjaman</th><th scope="col">Ke</th><th scope="col">Jatuh tempo</th><th scope="col">Pokok</th><th scope="col">Bunga</th><th scope="col">Angsuran</th><th scope="col">Status</th></tr></thead>
                  <tbody>{member.installments.data.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.loanDocNo}{i.parent === 'MISSING' && <span className="console-badge" data-state="partial"> induk pinjaman tidak ditemukan</span>}</td>
                      <td>{i.installmentNo ?? '—'}</td><td>{formatLegacyDate(i.due)}</td>
                      <td className="num">{formatAmount4(i.principal4)}</td><td className="num">{formatAmount4(i.interest4)}</td><td className="num">{formatAmount4(i.total4)}</td>
                      <td>{[i.status, i.type].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {member.installments.data.truncated && <p className="console-notice">Hanya 50 angsuran pertama yang ditampilkan.</p>}
              {member.installments.data.orphanParents > 0 && <p className="console-notice">{member.installments.data.orphanParents} angsuran merujuk pinjaman induk yang tidak ada. Dicatat, tidak dihapus dari tampilan.</p>}
              {(() => { const q = member.installments.data.quality; const bad = q.zeroDue + q.missingDue + q.implausibleDue; return bad > 0 ? <p className="console-notice">Dari {q.total} baris angsuran anggota ini, {bad} memiliki tanggal jatuh tempo kosong/nol/tidak wajar dan tidak dapat ditempatkan pada bulan tertentu.</p> : null; })()}
            </>)}
          </section>
        )}
      </>)}
    </div>
  );
}
