import { KosipaPageHeader, FeedbackState, FinancialTable } from '@/components/console/kosipa/KosipaUI';
import { ExportControl } from '@/components/console/kosipa/ExportControl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readMembershipReport, type OpsPart } from '@koperasi/application/kosipa/reports-ops';
import type { MembershipReport } from '@koperasi/domain/kosipa';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { REPORT_REASON } from '@/components/console/kosipa/report-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ringkasan Keanggotaan · KOSIPA · KKISI TB2' };

export default async function MembershipReportPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan/keanggotaan' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let part: OpsPart<MembershipReport> | null = null; let failed = false;
  try { part = await readMembershipReport({ reader: services.reports, ops: services.opsReports, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }); } catch { failed = true; }
  const canExport = auth.capabilities.has('kosipa.report.export');
  const r = part?.state === 'ok' ? part.data : null;

  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href="/console/kosipa/laporan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke laporan</Link>
      <KosipaPageHeader title={<> Ringkasan keanggotaan </>}><p>Jumlah anggota menurut <strong>status yang tercatat</strong>. Ini bukan daftar nonaktif: tanggal keluar hanya fakta tercatat, dan perlakuan kontrak berakhir menunggu keputusan pemilik.</p></KosipaPageHeader>
      {failed && <FeedbackState kind="error" title={<> Ringkasan tidak dapat dibaca </>} reset="/console/kosipa/laporan/keanggotaan"><p>Data tidak tersedia saat ini. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {part?.state === 'unavailable' && <FeedbackState kind="empty" title={<> Ringkasan tidak tersedia </>} reset="/console/kosipa/laporan/keanggotaan"><p>{REPORT_REASON[part.reason]}</p></FeedbackState>}
      {r && (<>
        {canExport && <ExportControl href="/api/kosipa/reports/membership/export" />}
        <section className="console-card" aria-labelledby="sec-status">
          <h2 id="sec-status">Status anggota dan karyawan (total {r.total})</h2>
          <FinancialTable label="Status anggota dan karyawan" columns={[{ label: "Status anggota" }, { label: "Status karyawan" }, { label: "Jumlah", numeric: true }, { label: "Tgl. keluar terisi", numeric: true }, { label: "Tgl. keluar sudah lewat", numeric: true }, { label: "Tanpa NIK", numeric: true }]}>
            <tbody>{r.lines.map((l) => (
              <tr key={`${l.status}|${l.employment}`}>
                <td>{l.status ?? 'KOSONG'}{!l.statusKnown && <span className="console-badge" data-state="partial"> nilai tidak dikenal</span>}</td>
                <td>{l.employment ? l.employment : 'KOSONG'}{!l.employmentKnown && <span className="console-badge" data-state="partial"> nilai tidak dikenal</span>}</td>
                <td className="num">{l.members}</td><td className="num">{l.withExitDate}</td><td className="num">{l.exitDateBeforeToday}</td><td className="num">{l.withoutNik}</td>
              </tr>
            ))}</tbody>
          </FinancialTable>
          {(r.unrecognised.status > 0 || r.unrecognised.employment > 0) && <p className="console-notice">Baris dengan nilai di luar daftar (mis. angka pada kolom status) dihitung terpisah dan tidak dipetakan ke status mana pun.</p>}
        </section>
        <section className="console-card" aria-labelledby="sec-grup">
          <h2 id="sec-grup">Grup anggota</h2>
          <FinancialTable label="Grup anggota" columns={[{ label: "Grup tercatat" }, { label: "Jumlah", numeric: true }]}>
            <tbody>{r.groups.map((g) => <tr key={String(g.group)}><td>{g.group ?? 'KOSONG'}{!g.known && <span className="console-badge" data-state="partial"> nilai tidak dikenal</span>}</td><td className="num">{g.members}</td></tr>)}</tbody>
          </FinancialTable>
          {r.unrecognised.group > 0 && <p className="console-notice">{r.unrecognised.group} anggota memiliki nilai grup di luar daftar; kemungkinan kolom bergeser pada data lama. Tidak diperbaiki.</p>}
        </section>
      </>)}
    </div>
  );
}
