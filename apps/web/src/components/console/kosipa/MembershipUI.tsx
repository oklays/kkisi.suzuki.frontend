import Link from 'next/link';
import { ChevronLeft, ChevronRight, Database, Eye, Info, Pencil, RotateCcw, UserPlus, Users, UsersRound } from 'lucide-react';
import { ALL_VALUES, DIRECTORY_EMPLOYMENT, DIRECTORY_GROUPS, DIRECTORY_PAGE_SIZES, DIRECTORY_STATUSES, type MemberCounts, type MemberDirectory, type MemberSummary } from '@koperasi/application/kosipa/member-360';
import { FeedbackState, FinancialTable, Provenance } from './KosipaUI';
import { MembershipPageSize, MembershipSearchField, MembershipSelect } from './MembershipControls';
import { initialsOf, avatarTone } from './membership-format';
import { PageBreadcrumbs } from '../PageBreadcrumbs';

const BASE = '/console/kosipa/anggota';
const number = (n: number) => n.toLocaleString('id-ID');

/** Breadcrumb, title and purpose, with a small decorative card illustration (hidden on narrow screens). */
export function MembershipPageHeader({ readOnly }: { readOnly: boolean }) {
  return <header className="membership-header">
    <PageBreadcrumbs />
    <div className="membership-title-row">
      <span className="membership-title-icon" aria-hidden="true"><UsersRound size={28} /></span>
      <div>
        <h1 tabIndex={-1}>Keanggotaan {readOnly && <Provenance kind="readonly" />}</h1>
        <p>Temukan anggota dan telusuri profil, simpanan, pinjaman, serta potongan yang boleh Anda lihat.</p>
      </div>
    </div>
    <svg className="membership-illustration" viewBox="0 0 280 120" role="presentation" aria-hidden="true" focusable="false">
      <path d="M0 96C40 70 76 112 126 86s74-52 154-34v68H0z" fill="#dbe8ff" opacity=".7" />
      <rect x="86" y="22" width="112" height="72" rx="12" fill="#cfe0ff" transform="rotate(8 142 58)" />
      <rect x="70" y="14" width="112" height="72" rx="12" fill="#fff" stroke="#bcd0f5" />
      <circle cx="100" cy="42" r="12" fill="#5b8def" /><path d="M82 70c2-12 34-12 36 0z" fill="#5b8def" />
      <rect x="128" y="34" width="38" height="6" rx="3" fill="#bcd0f5" /><rect x="128" y="48" width="30" height="6" rx="3" fill="#d6e2fa" />
      <circle cx="196" cy="24" r="14" fill="#22a65b" /><path d="M189 24l5 5 9-10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </header>;
}

/** Cards show whole-table counts; each one says which rule it counts. A failed count shows an unavailable state, never a made-up number. */
export function MembershipStats({ counts, canCreate }: { counts: MemberCounts | null; canCreate: boolean }) {
  const cards = [
    { key: 'active', label: 'Anggota Aktif', rule: 'status AKTIVE', value: counts?.active, Icon: Users, tone: 'green' },
    { key: 'non', label: 'Non Anggota', rule: 'grup NON ANGGOTA, semua status', value: counts?.nonMember, Icon: Users, tone: 'gray' },
    { key: 'total', label: 'Total Data', rule: 'seluruh catatan anggota', value: counts?.total, Icon: Database, tone: 'blue' },
  ] as const;
  return <section className="membership-stats" aria-label="Ringkasan keanggotaan">
    {cards.map(({ key, label, rule, value, Icon, tone }) => <div className="membership-stat" key={key}>
      <span className="membership-stat-icon" data-tone={tone} aria-hidden="true"><Icon size={26} /></span>
      <div><span className="membership-stat-label">{label}</span>
        <strong data-tone={key === 'active' ? 'primary' : undefined}>{value === undefined ? '—' : number(value)}</strong>
        <small>{value === undefined ? 'Tidak tersedia saat ini' : rule}</small></div>
    </div>)}
    {canCreate && <div className="membership-stat-cta"><Link prefetch={false} className="kosipa-primary-action" href={`${BASE}/baru`}><UserPlus size={18} aria-hidden="true" />Daftarkan anggota baru</Link></div>}
  </section>;
}

const option = (value: string, label = value) => ({ value, label });
const GROUP_OPTIONS = [option(ALL_VALUES, 'Semua'), ...DIRECTORY_GROUPS.map((g) => option(g))];
const STATUS_OPTIONS = [option(ALL_VALUES, 'Semua'), ...DIRECTORY_STATUSES.map((s) => option(s))];
const EMPLOYMENT_OPTIONS = [option(ALL_VALUES, 'Semua'), ...DIRECTORY_EMPLOYMENT.map((e) => option(e, e === 'KOSONG' ? 'Tidak tercatat' : e))];

/** Everything inside ONE private form (data-kosipa-private): search, filters, page size and page buttons post together, so nothing is lost between pages. */
export function MembershipWorkspace({ directory, canUpdate, failed }: { directory: MemberDirectory | null; canUpdate: boolean; failed: boolean }) {
  const sel = directory?.selected ?? { q: '', grup: ALL_VALUES, status: 'AKTIVE', karyawan: ALL_VALUES };
  const filtered = sel.q !== '' || sel.grup !== ALL_VALUES || sel.status !== 'AKTIVE' || sel.karyawan !== ALL_VALUES;
  return <form action={BASE} method="post" data-kosipa-private className="membership-workspace">
    <div className="membership-toolbar" role="search">
      <MembershipSearchField defaultValue={sel.q} />
      <MembershipSelect name="grup" label="Filter grup" prefix="Grup" value={sel.grup} options={GROUP_OPTIONS} />
      <MembershipSelect name="status" label="Filter status" prefix="Status" value={sel.status} options={STATUS_OPTIONS} />
      <MembershipSelect name="karyawan" label="Filter karyawan" prefix="Karyawan" value={sel.karyawan} options={EMPLOYMENT_OPTIONS} />
      <button type="submit" name="_reset" value="1" formNoValidate className="membership-reset"><RotateCcw size={16} aria-hidden="true" />Reset</button>
    </div>
    <section className="membership-table-section" aria-label="Daftar anggota">
      <div className="membership-table-head">
        <h2>Anggota</h2>
        {directory && !failed && <span className="membership-count">{number(directory.total)} anggota</span>}
      </div>
      {failed && <FeedbackState kind="error" title={<> Daftar anggota gagal dimuat </>} reset={BASE}><p>Data anggota tidak dapat dibaca saat ini. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {!failed && directory?.queryTooShort && <p className="console-notice" role="status">Masukkan minimal 2 karakter untuk mencari.</p>}
      {!failed && directory && !directory.queryTooShort && directory.items.length === 0 && (
        <FeedbackState kind="empty" title={<> {filtered ? 'Tidak ada anggota yang cocok' : 'Belum ada anggota'} </>} reset={BASE}>
          <p>{filtered ? 'Tidak ada anggota untuk kombinasi pencarian dan filter ini. Ubah kata kunci atau tekan Reset.' : 'Belum ada catatan anggota yang dapat ditampilkan.'}</p>
        </FeedbackState>
      )}
      {!failed && directory && directory.items.length > 0 && <>
        <MembershipTable rows={directory.items} offset={(directory.page - 1) * directory.pageSize} canUpdate={canUpdate} />
        <div className="membership-footer">
          <div className="membership-footer-size"><MembershipPageSize value={directory.pageSize} sizes={DIRECTORY_PAGE_SIZES} /><span>dari {number(directory.total)} data</span></div>
          <MembershipPagination page={directory.page} pageCount={directory.pageCount} />
        </div>
        <p className="console-visually-hidden" role="status" aria-live="polite">Halaman {directory.page} dari {directory.pageCount}, {number(directory.total)} anggota.</p>
      </>}
    </section>
  </form>;
}

function MembershipTable({ rows, offset, canUpdate }: { rows: readonly MemberSummary[]; offset: number; canUpdate: boolean }) {
  return <div className="membership-table">
    <FinancialTable label="Daftar anggota" columns={[{ label: '#' }, { label: 'NIK' }, { label: 'Nama' }, { label: 'Grup' }, { label: 'Status' }, { label: 'Karyawan' }, { label: 'Aksi' }]}>
      <tbody>{rows.map((m, i) => (
        <tr key={m.id}>
          <td className="membership-rownum" data-label="No.">{number(offset + i + 1)}</td>
          <td className="membership-nik" data-label="NIK">{m.nik || '—'}</td>
          <td className="membership-namecell"><span className="membership-name"><span className="membership-avatar" data-tone={avatarTone(m.name)} aria-hidden="true">{initialsOf(m.name)}</span><span className="membership-name-text" title={m.name}>{m.name || '—'}</span></span></td>
          <td data-label="Grup">{m.group ? <span className="membership-group">{m.group}</span> : '—'}</td>
          <td data-label="Status"><MembershipStatusBadge value={m.status} /></td>
          <td data-label="Karyawan">{m.employment?.trim() || '—'}</td>
          <td className="membership-actioncell"><span className="membership-actions">
            <Link prefetch={false} className="membership-view" href={`${BASE}/${m.id}`}><Eye size={16} aria-hidden="true" />Lihat profil<span className="console-visually-hidden"> {m.name}</span></Link>
            {canUpdate && <Link prefetch={false} className="membership-edit" href={`${BASE}/${m.id}/ubah`} aria-label={`Ubah ${m.name}`} title="Ubah"><Pencil size={15} aria-hidden="true" /></Link>}
          </span></td>
        </tr>
      ))}</tbody>
    </FinancialTable>
  </div>;
}

/** Text always carries the status; the dot colour only reinforces it. */
export function MembershipStatusBadge({ value }: { value: string | null }) {
  const status = value?.trim() ?? '';
  const tone = status === 'AKTIVE' ? 'active' : status === '' ? 'unknown' : ['RESIGN', 'PENSIUN'].includes(status) ? 'ended' : 'other';
  return <span className="membership-status" data-tone={tone}><span aria-hidden="true" />{status || 'Tidak tercatat'}</span>;
}

/** Near either end show five numbers (1 2 3 4 5 … last); in the middle show the current page with its neighbours. First and last stay reachable. */
function pageWindow(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, null, count];
  if (page >= count - 3) return [1, null, count - 4, count - 3, count - 2, count - 1, count];
  return [1, null, page - 1, page, page + 1, null, count];
}
function MembershipPagination({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  return <nav className="membership-pagination" aria-label="Halaman daftar anggota">
    <button type="submit" name="page" value={page - 1} disabled={page <= 1} aria-label="Halaman sebelumnya"><ChevronLeft size={16} aria-hidden="true" /></button>
    {pageWindow(page, pageCount).map((n, i) => n === null
      ? <span key={`gap-${i}`} className="membership-gap" aria-hidden="true">…</span>
      : <button key={n} type="submit" name="page" value={n} aria-label={`Halaman ${n}`} aria-current={n === page ? 'page' : undefined}>{number(n)}</button>)}
    <button type="submit" name="page" value={page + 1} disabled={page >= pageCount} aria-label="Halaman berikutnya"><ChevronRight size={16} aria-hidden="true" /></button>
  </nav>;
}

/** Environment banner for the local copy of production (rendered by the KOSIPA layout). */
export function LocalReplicaBanner({ database }: { database: string }) {
  return <p className="kosipa-environment" role="note"><Info size={18} aria-hidden="true" /><strong>SALINAN LOKAL DATA PRODUKSI — BUKAN PRODUKSI</strong><small>Uji tulis di Mac lokal · {database}</small></p>;
}
