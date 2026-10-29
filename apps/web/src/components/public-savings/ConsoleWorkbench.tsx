'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { Ban, Check, ChevronLeft, ChevronRight, CircleAlert, Clock, Copy, FileDown, Hourglass, Inbox, Link2, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { downloadPdf, requestJson, rupiah, SavingsApiError } from './client';

type Period = { year: number; month: number } | string;
interface Application { reference: string; name: string; maskedIdentifier?: string; amount: string; originalAmount?: string | null; requestedPeriod: Period; status: string; artifactState: string; integrityState?: 'VALID' | 'INVALID'; createdAt?: number }
interface LinkRow { linkRef: string; memberRef: string; memberName?: string; maskedIdentifier?: string; state: string; expiresAt: number; createdAt?: number }
interface Member { memberRef: string; name: string; maskedIdentifier: string; sectionName: string }
interface Page<T> { items: T[]; total: number; page: number; pageSize: number; counts: Record<string, number> }
type Tab = 'applications' | 'links';
interface ListState { q: string; status: string; page: number; pageSize: number }

const base = '/api/kosipa';
const APPLICATION_STATUS: Record<string, { label: string; tone: string }> = {
  OPEN: { label: 'Menunggu proses', tone: 'amber' }, APPROVED: { label: 'Disetujui', tone: 'green' }, REJECTED: { label: 'Ditolak', tone: 'red' },
  CANCELLED: { label: 'Dibatalkan', tone: 'slate' }, ASSISTED_REQUIRED: { label: 'Perlu pemeriksaan', tone: 'orange' },
};
const LINK_STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Aktif', tone: 'blue' }, CONSUMED: { label: 'Sudah dipakai', tone: 'green' }, EXPIRED: { label: 'Kedaluwarsa', tone: 'slate' }, REVOKED: { label: 'Dicabut', tone: 'red' },
};
const FILTERS: Record<Tab, readonly string[]> = { applications: ['OPEN', 'APPROVED', 'REJECTED'], links: ['ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED'] };
const jakarta = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const when = (ms?: number) => (ms && Number.isFinite(ms) ? jakarta.format(new Date(ms)) + ' WIB' : '—');
const period = (p: Period) => (typeof p === 'string' ? p : `${months[p.month - 1] ?? p.month} ${p.year}`);
function remaining(ms: number, now: number) {
  const left = ms - now;
  if (left <= 0) return 'berakhir';
  const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000), m = Math.floor((left % 3600000) / 60000);
  if (d > 30) return 'sisa > 30 hari';
  return d >= 1 ? `sisa ${d} hr ${h} j` : h >= 1 ? `sisa ${h} j ${m} m` : `sisa ${m} m`;
}
// Staff-facing wording; the public page keeps its own member-facing messages.
function staffMessage(error: unknown): string {
  if (!(error instanceof SavingsApiError)) return 'Permintaan gagal. Periksa koneksi lalu coba lagi.';
  if (error.status === 401 || error.code === 'CSRF') return 'Sesi konsol berakhir. Muat ulang halaman dan masuk kembali.';
  if (/FORBIDDEN|LEGACY_CI2_ONLY/.test(error.code) || error.status === 403) return 'Akun ini tidak berwenang untuk tindakan tersebut di cabang aktif.';
  if (/OPERATOR_AUTHORIZATION/.test(error.code)) return 'Konfigurasi akses operator belum tersedia. Hubungi administrator sistem.';
  if (/ACTIVATION_BLOCKED/.test(error.code)) return 'Penerbitan tautan sedang dinonaktifkan.';
  if (/PENDING_CONFLICT|CONFLICTING|ACTIVE_APPLICATION/.test(error.code)) return 'Anggota masih memiliki pengajuan aktif. Selesaikan di KOSIPA CI2 terlebih dahulu.';
  if (/ASSISTED_REQUIRED|INELIGIBLE|MEMBER_|CONTACT|ROSTER|GROUP|BRANCH/.test(error.code)) return 'Anggota belum memenuhi syarat tautan mandiri. Proses melalui petugas.';
  if (/INVALID_INPUT/.test(error.code)) return 'Isian tidak valid. Periksa kembali lalu coba lagi.';
  if (/RATE_LIMITED/.test(error.code)) return 'Terlalu banyak permintaan. Tunggu sebentar.';
  return 'Layanan belum dapat memproses permintaan. Coba lagi beberapa saat lagi.';
}

function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, delta = value - start;
    if (delta === 0 || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return; }
    let frame = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 520), eased = 1 - (1 - k) ** 3; setShown(Math.round(start + delta * eased)); if (k < 1) frame = requestAnimationFrame(step); else from.current = value; };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) { return <span className="pssc-pill" data-tone={tone}><i aria-hidden="true" />{children}</span>; }

function Stat({ label, value, tone, icon, active, onClick }: { label: string; value: number | null; tone: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  const shown = useCountUp(value ?? 0);
  return (
    <button type="button" className="pssc-stat" data-tone={tone} aria-pressed={active} onClick={onClick}>
      <span className="pssc-stat-icon" aria-hidden="true">{icon}</span>
      <span className="pssc-stat-copy"><strong>{value === null ? '—' : shown.toLocaleString('id-ID')}</strong><small>{label}</small></span>
    </button>
  );
}

function pageWindow(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b), out: (number | '…')[] = [];
  sorted.forEach((p, i) => { if (i && p - sorted[i - 1] > 1) out.push('…'); out.push(p); });
  return out;
}

export default function ConsoleWorkbench({ csrfToken }: { csrfToken: string }) {
  const headers = useMemo(() => ({ 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' }), [csrfToken]);
  // Console CSRF guard needs same-origin Referer and JSON type, including GET lookups bound to a mutating action.
  const call = useCallback(<T,>(path: string, init: RequestInit = {}) => requestJson<T>(path, { ...init, credentials: 'include', referrerPolicy: 'same-origin', headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } }), [headers]);

  const [tab, setTab] = useState<Tab>('applications');
  const [lists, setLists] = useState<Record<Tab, ListState>>({ applications: { q: '', status: '', page: 1, pageSize: 10 }, links: { q: '', status: '', page: 1, pageSize: 10 } });
  const [draft, setDraft] = useState<Record<Tab, string>>({ applications: '', links: '' });
  const [data, setData] = useState<{ applications: Page<Application> | null; links: Page<LinkRow> | null }>({ applications: null, links: null });
  const [loading, setLoading] = useState<Record<Tab, boolean>>({ applications: true, links: true });
  const [failure, setFailure] = useState<Record<Tab, string>>({ applications: '', links: '' });
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: 'ok' | 'error' }[]>([]);
  const [revoking, setRevoking] = useState<{ ref: string; reason: string; busy: boolean } | null>(null);
  const [downloading, setDownloading] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [issued, setIssued] = useState<{ linkRef: string; url: string; expiresAt: number; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const toastSeq = useRef(0);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ applications: null, links: null });
  const [ink, setInk] = useState<{ left: number; width: number } | null>(null);

  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++toastSeq.current; setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);

  // Debounced search: typing never fires one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setLists((l) => (l[tab].q === draft[tab].trim() ? l : { ...l, [tab]: { ...l[tab], q: draft[tab].trim(), page: 1 } })), 320);
    return () => clearTimeout(timer);
  }, [draft, tab]);

  const load = useCallback(async (which: Tab, state: ListState, signal: AbortSignal) => {
    setLoading((l) => ({ ...l, [which]: true })); setFailure((f) => ({ ...f, [which]: '' }));
    const params = new URLSearchParams({ page: String(state.page), pageSize: String(state.pageSize) });
    if (state.q) params.set('q', state.q); if (state.status) params.set('status', state.status);
    try {
      const path = which === 'applications' ? `${base}/savings-applications?${params}` : `${base}/public-savings-links?${params}`;
      const body = await call<{ applications?: Application[]; links?: LinkRow[]; total: number; page: number; pageSize: number; counts: Record<string, number> }>(path, { method: 'GET', signal });
      if (signal.aborted) return;
      const items = (which === 'applications' ? body.applications : body.links) ?? [];
      setData((d) => ({ ...d, [which]: { items, total: body.total ?? items.length, page: body.page ?? state.page, pageSize: body.pageSize ?? state.pageSize, counts: body.counts ?? {} } }));
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      setFailure((f) => ({ ...f, [which]: staffMessage(error) }));
    } finally { if (!signal.aborted) setLoading((l) => ({ ...l, [which]: false })); }
  }, [call]);

  useEffect(() => { const c = new AbortController(); void load('applications', lists.applications, c.signal); return () => c.abort(); }, [load, lists.applications, revision]);
  useEffect(() => { const c = new AbortController(); void load('links', lists.links, c.signal); return () => c.abort(); }, [load, lists.links, revision]);

  const patch = (which: Tab, change: Partial<ListState>) => setLists((l) => ({ ...l, [which]: { ...l[which], ...change } }));
  const focusFilter = (which: Tab, status: string) => { setTab(which); patch(which, { status: lists[which].status === status ? '' : status, page: 1 }); };
  const refresh = () => setRevision((r) => r + 1);

  async function searchMembers(event: FormEvent) {
    event.preventDefault(); const query = memberQuery.trim();
    if (query.length < 2) { setIssueError('Masukkan NIK atau ID anggota, minimal 2 karakter.'); return; }
    setMemberBusy(true); setIssueError(''); setMembers(null);
    try { setMembers((await call<{ members: Member[] }>(`${base}/public-savings-links/members?query=${encodeURIComponent(query)}`, { method: 'GET' })).members); }
    catch (error) { setIssueError(staffMessage(error)); } finally { setMemberBusy(false); }
  }
  async function issue(member: Member) {
    setMemberBusy(true); setIssueError(''); setIssued(null); setCopied(false);
    try {
      const body = await call<{ linkRef: string; url: string; expiresAt: number }>(`${base}/public-savings-links`, { method: 'POST', body: JSON.stringify({ memberRef: member.memberRef }) });
      const url = new URL(body.url, window.location.origin); if (url.origin !== window.location.origin) throw new Error('LINK_ORIGIN_INVALID');
      setIssued({ linkRef: body.linkRef, url: url.href, expiresAt: Number(body.expiresAt), name: member.name }); setMembers(null); setMemberQuery('');
      toast(`Tautan untuk ${member.name} diterbitkan.`); refresh();
    } catch (error) { setIssueError(staffMessage(error)); } finally { setMemberBusy(false); }
  }
  async function copyIssued() {
    if (!issued) return;
    try { await navigator.clipboard.writeText(issued.url); setCopied(true); setTimeout(() => setCopied(false), 2200); toast('Tautan disalin ke papan klip.'); }
    catch { toast('Salin manual: pilih teks tautan lalu salin.', 'error'); }
  }
  async function confirmRevoke(event: FormEvent) {
    event.preventDefault(); if (!revoking || revoking.reason.trim().length < 3) return;
    setRevoking({ ...revoking, busy: true });
    try { await call(`${base}/public-savings-links/${encodeURIComponent(revoking.ref)}/revoke`, { method: 'POST', body: JSON.stringify({ reason: revoking.reason.trim() }) }); setRevoking(null); toast('Tautan telah dicabut.'); refresh(); }
    catch (error) { setRevoking({ ...revoking, busy: false }); toast(staffMessage(error), 'error'); }
  }
  async function pdf(reference: string) {
    setDownloading(reference);
    try { await downloadPdf(`${base}/savings-applications/${encodeURIComponent(reference)}/pdf`, headers, `bukti-${reference}.pdf`, 'include'); toast('PDF bukti diunduh.'); }
    catch (error) { toast(staffMessage(error), 'error'); } finally { setDownloading(''); }
  }

  // The tab indicator follows the measured tab, so label or count width changes never misalign it.
  useLayoutEffect(() => { const el = tabRefs.current[tab]; if (el) setInk({ left: el.offsetLeft, width: el.offsetWidth }); }, [tab, data.applications?.total, data.links?.total]);
  const current = lists[tab], page = data[tab], busy = loading[tab];
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  const counts = { app: data.applications?.counts, link: data.links?.counts };
  const from = page && page.total ? (page.page - 1) * page.pageSize + 1 : 0, to = page ? Math.min(page.total, page.page * page.pageSize) : 0;
  const statusMap = tab === 'applications' ? APPLICATION_STATUS : LINK_STATUS;
  const skeleton = busy && !page;

  return (
    <div className="pssc">
      <header className="pssc-head">
        <div className="pssc-head-copy">
          <span className="pssc-eyebrow">KOSIPA <i aria-hidden="true">/</i> Simpanan sukarela</span>
          <h1>Pengajuan simpanan sukarela</h1>
          <p>Terbitkan tautan pengajuan mandiri dan pantau bukti yang masuk. Persetujuan potongan tetap diproses di KOSIPA CI2.</p>
        </div>
        <div className="pssc-head-actions">
          <span className="pssc-session"><ShieldCheck size={14} aria-hidden="true" /> Sesi konsol · cabang aktif</span>
          <button type="button" className="pssc-btn pssc-btn-ghost pssc-btn-icon" onClick={refresh} aria-label="Muat ulang data" title="Muat ulang">
            <RefreshCw size={15} aria-hidden="true" className={loading.applications || loading.links ? 'pssc-spin' : ''} />
          </button>
          <button type="button" className="pssc-btn pssc-btn-primary" aria-expanded={issueOpen} aria-controls="pssc-issue" onClick={() => setIssueOpen((o) => !o)}>
            <Plus size={15} aria-hidden="true" className={issueOpen ? 'pssc-rotate' : ''} /> Terbitkan tautan
          </button>
        </div>
      </header>

      <div className="pssc-stats" role="group" aria-label="Ringkasan">
        <Stat label="Menunggu proses" value={counts.app?.OPEN ?? null} tone="amber" icon={<Hourglass size={16} />} active={tab === 'applications' && current.status === 'OPEN'} onClick={() => focusFilter('applications', 'OPEN')} />
        <Stat label="Disetujui" value={counts.app?.APPROVED ?? null} tone="green" icon={<Check size={16} />} active={tab === 'applications' && current.status === 'APPROVED'} onClick={() => focusFilter('applications', 'APPROVED')} />
        <Stat label="Ditolak" value={counts.app?.REJECTED ?? null} tone="red" icon={<X size={16} />} active={tab === 'applications' && current.status === 'REJECTED'} onClick={() => focusFilter('applications', 'REJECTED')} />
        <Stat label="Tautan aktif" value={counts.link?.ACTIVE ?? null} tone="blue" icon={<Link2 size={16} />} active={tab === 'links' && current.status === 'ACTIVE'} onClick={() => focusFilter('links', 'ACTIVE')} />
      </div>

      <section id="pssc-issue" className="pssc-issue" data-open={issueOpen} aria-hidden={!issueOpen} aria-label="Terbitkan tautan anggota">
        <div className="pssc-issue-inner">
          <div className="pssc-issue-body">
            <form className="pssc-issue-search" onSubmit={searchMembers} role="search">
              <label htmlFor="pssc-member">Cari anggota <small>NIK atau ID, pencocokan tepat</small></label>
              <div className="pssc-field">
                <UserRound size={15} aria-hidden="true" />
                <input id="pssc-member" autoComplete="off" spellCheck={false} placeholder="mis. SYN0000001" value={memberQuery} onChange={(e) => { setMemberQuery(e.target.value); setIssueError(''); }} tabIndex={issueOpen ? 0 : -1} />
                <button type="submit" className="pssc-btn pssc-btn-primary pssc-btn-sm" disabled={memberBusy} tabIndex={issueOpen ? 0 : -1}>{memberBusy ? <LoaderCircle size={14} className="pssc-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />} Cari</button>
              </div>
              {issueError && <p className="pssc-alert" data-tone="error" role="alert"><CircleAlert size={14} aria-hidden="true" />{issueError}</p>}
              {members && (members.length === 0
                ? <p className="pssc-muted">Tidak ada anggota yang cocok di cabang aktif.</p>
                : <ul className="pssc-members">{members.map((m, i) => (
                  <li key={m.memberRef} style={{ '--i': i } as CSSProperties}>
                    <span className="pssc-avatar" aria-hidden="true">{m.name.slice(0, 1)}</span>
                    <span className="pssc-member-copy"><strong>{m.name}</strong><small>{m.maskedIdentifier} · {m.sectionName}</small></span>
                    <button type="button" className="pssc-btn pssc-btn-soft pssc-btn-sm" disabled={memberBusy} onClick={() => void issue(m)}><Link2 size={13} aria-hidden="true" /> Terbitkan</button>
                  </li>))}</ul>)}
            </form>
            {issued ? (
              <div className="pssc-ticket" role="status">
                <div className="pssc-ticket-top"><span><Check size={13} aria-hidden="true" /> Tautan diterbitkan</span><small>{issued.linkRef.slice(0, 8)}</small></div>
                <strong className="pssc-ticket-name">{issued.name}</strong>
                <div className="pssc-ticket-url"><input readOnly value={issued.url} aria-label="Tautan privat anggota" onFocus={(e) => e.target.select()} tabIndex={issueOpen ? 0 : -1} />
                  <button type="button" className="pssc-btn pssc-btn-soft pssc-btn-sm" data-done={copied} onClick={() => void copyIssued()} tabIndex={issueOpen ? 0 : -1}>{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied ? 'Disalin' : 'Salin'}</button></div>
                <div className="pssc-ticket-foot"><Clock size={12} aria-hidden="true" /> Berlaku sampai {when(issued.expiresAt)} · {remaining(issued.expiresAt, now)}</div>
                <p>Hanya ditampilkan sekali. Kirim melalui jalur resmi koperasi; jangan dibagikan ke pihak lain.</p>
              </div>
            ) : (
              <div className="pssc-ticket pssc-ticket-empty" aria-hidden="true"><Link2 size={18} /><span>Tautan yang diterbitkan akan tampil di sini, sekali saja.</span></div>
            )}
          </div>
        </div>
      </section>

      <section className="pssc-card" aria-label="Daftar">
        <div className="pssc-tabs" role="tablist" aria-label="Jenis data">
          {(['applications', 'links'] as const).map((t) => (
            <button key={t} ref={(el) => { tabRefs.current[t] = el; }} type="button" role="tab" id={`pssc-tab-${t}`} aria-selected={tab === t} aria-controls="pssc-panel" onClick={() => { setTab(t); setRevoking(null); }}>
              {t === 'applications' ? 'Pengajuan' : 'Tautan'}<span className="pssc-count">{data[t]?.total ?? '·'}</span>
            </button>
          ))}
          <span className="pssc-tab-ink" aria-hidden="true" style={ink ? { width: ink.width, transform: `translateX(${ink.left}px)` } : { opacity: 0 }} />
        </div>

        <div className="pssc-toolbar">
          <div className="pssc-field pssc-search">
            <Search size={15} aria-hidden="true" />
            <input type="search" aria-label={tab === 'applications' ? 'Cari referensi, nama atau NIK' : 'Cari tautan, nama, NIK atau ID anggota'} placeholder={tab === 'applications' ? 'Cari referensi, nama, NIK…' : 'Cari tautan, nama, NIK, ID…'} value={draft[tab]} onChange={(e) => setDraft((d) => ({ ...d, [tab]: e.target.value }))} maxLength={50} />
            {draft[tab] && <button type="button" className="pssc-clear" aria-label="Hapus pencarian" onClick={() => setDraft((d) => ({ ...d, [tab]: '' }))}><X size={13} /></button>}
          </div>
          <div className="pssc-chips" role="group" aria-label="Filter status">
            <button type="button" className="pssc-chip" aria-pressed={!current.status} onClick={() => patch(tab, { status: '', page: 1 })}>Semua</button>
            {FILTERS[tab].map((s) => (
              <button key={s} type="button" className="pssc-chip" data-tone={statusMap[s].tone} aria-pressed={current.status === s} onClick={() => patch(tab, { status: current.status === s ? '' : s, page: 1 })}>
                {statusMap[s].label}<span>{page?.counts[s] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div id="pssc-panel" role="tabpanel" aria-labelledby={`pssc-tab-${tab}`} className="pssc-table-wrap" aria-busy={busy}>
          {busy && page && <div className="pssc-progress" aria-hidden="true" />}
          {failure[tab] ? (
            <div className="pssc-state"><CircleAlert size={20} aria-hidden="true" /><p role="alert">{failure[tab]}</p><button type="button" className="pssc-btn pssc-btn-ghost pssc-btn-sm" onClick={refresh}><RefreshCw size={13} aria-hidden="true" /> Coba lagi</button></div>
          ) : skeleton ? (
            <div className="pssc-skeleton" aria-label="Memuat">{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ '--i': i } as CSSProperties} />)}</div>
          ) : page && page.items.length === 0 ? (
            <div className="pssc-state"><Inbox size={22} aria-hidden="true" /><p>{current.q || current.status ? 'Tidak ada data yang cocok dengan pencarian atau filter.' : tab === 'applications' ? 'Belum ada pengajuan masuk.' : 'Belum ada tautan yang diterbitkan.'}</p>
              {(current.q || current.status) && <button type="button" className="pssc-btn pssc-btn-ghost pssc-btn-sm" onClick={() => { setDraft((d) => ({ ...d, [tab]: '' })); patch(tab, { q: '', status: '', page: 1 }); }}>Reset filter</button>}</div>
          ) : page && tab === 'applications' ? (
            <table className="pssc-table">
              <thead><tr><th>Referensi</th><th>Anggota</th><th className="num">Potongan</th><th>Periode</th><th>Status</th><th className="act"><span className="pssc-sr">Bukti</span></th></tr></thead>
              <tbody key={`${current.page}-${current.status}-${current.q}-${revision}`}>{(page.items as Application[]).map((a, i) => {
                const s = APPLICATION_STATUS[a.status] ?? { label: a.status, tone: 'slate' };
                return (
                  <tr key={a.reference} style={{ '--i': i } as CSSProperties}>
                    <td><code title={a.reference}>{a.reference.slice(0, 11)}…{a.reference.slice(-9, -5)}</code><small>{when(a.createdAt)}</small></td>
                    <td><strong>{a.name}</strong>{a.maskedIdentifier && <small>{a.maskedIdentifier}</small>}</td>
                    <td className="num">{a.integrityState === 'INVALID' ? '—' : <><strong>{rupiah(a.amount)}</strong>{a.originalAmount !== undefined && <small>dari {a.originalAmount === null ? 'belum ada' : rupiah(a.originalAmount)}</small>}</>}</td>
                    <td>{period(a.requestedPeriod)}</td>
                    <td><Pill tone={s.tone}>{s.label}</Pill></td>
                    <td className="act">{a.artifactState === 'READY'
                      ? <button type="button" className="pssc-btn pssc-btn-ghost pssc-btn-xs" disabled={downloading === a.reference} onClick={() => void pdf(a.reference)} aria-label={`Unduh PDF ${a.reference}`}>{downloading === a.reference ? <LoaderCircle size={13} className="pssc-spin" aria-hidden="true" /> : <FileDown size={13} aria-hidden="true" />} PDF</button>
                      : a.artifactState === 'FAILED' ? <span className="pssc-warn" title="Bukti tidak tersedia; perlu pemeriksaan"><CircleAlert size={13} aria-hidden="true" /> Periksa</span>
                      : <span className="pssc-muted pssc-inline"><LoaderCircle size={12} className="pssc-spin" aria-hidden="true" /> Disiapkan</span>}</td>
                  </tr>);
              })}</tbody>
            </table>
          ) : page ? (
            <table className="pssc-table">
              <thead><tr><th>Tautan</th><th>Anggota</th><th>Status</th><th>Berlaku sampai</th><th className="act"><span className="pssc-sr">Aksi</span></th></tr></thead>
              <tbody key={`${current.page}-${current.status}-${current.q}-${revision}`}>{(page.items as LinkRow[]).flatMap((l, i) => {
                const s = LINK_STATUS[l.state] ?? { label: l.state, tone: 'slate' }, open = revoking?.ref === l.linkRef;
                const rows = [(
                  <tr key={l.linkRef} style={{ '--i': i } as CSSProperties} data-open={open}>
                    <td><code title={l.linkRef}>{l.linkRef.slice(0, 8)}</code><small>{when(l.createdAt)}</small></td>
                    <td><strong>{l.memberName ?? `Anggota ${l.memberRef}`}</strong><small>{l.maskedIdentifier ?? `ID ${l.memberRef}`}</small></td>
                    <td><Pill tone={s.tone}>{s.label}</Pill></td>
                    <td>{when(l.expiresAt)}{l.state === 'ACTIVE' && <small className="pssc-timer">{remaining(l.expiresAt, now)}</small>}</td>
                    <td className="act">{l.state === 'ACTIVE' && <button type="button" className="pssc-btn pssc-btn-danger-ghost pssc-btn-xs" aria-expanded={open} onClick={() => setRevoking(open ? null : { ref: l.linkRef, reason: '', busy: false })}><Ban size={13} aria-hidden="true" /> {open ? 'Batal' : 'Cabut'}</button>}</td>
                  </tr>)];
                if (open && revoking) rows.push(
                  <tr key={`${l.linkRef}-revoke`} className="pssc-revoke-row"><td colSpan={5}>
                    <form className="pssc-revoke" onSubmit={confirmRevoke}>
                      <label htmlFor={`pssc-reason-${l.linkRef}`}>Alasan pencabutan</label>
                      <input id={`pssc-reason-${l.linkRef}`} autoFocus required minLength={3} maxLength={200} placeholder="mis. permintaan anggota, salah penerima" value={revoking.reason} onChange={(e) => setRevoking({ ...revoking, reason: e.target.value })} />
                      <button type="submit" className="pssc-btn pssc-btn-danger pssc-btn-sm" disabled={revoking.busy || revoking.reason.trim().length < 3}>{revoking.busy ? <LoaderCircle size={13} className="pssc-spin" aria-hidden="true" /> : <Ban size={13} aria-hidden="true" />} Cabut tautan</button>
                    </form>
                  </td></tr>);
                return rows;
              })}</tbody>
            </table>
          ) : null}
        </div>

        <footer className="pssc-pager">
          <span className="pssc-muted">{page ? (page.total ? `Menampilkan ${from}–${to} dari ${page.total.toLocaleString('id-ID')}` : '0 data') : 'Memuat…'}</span>
          <label className="pssc-size">Baris<select value={current.pageSize} onChange={(e) => patch(tab, { pageSize: Number(e.target.value), page: 1 })}>{[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <nav className="pssc-pages" aria-label="Halaman">
            <button type="button" className="pssc-page" aria-label="Halaman sebelumnya" disabled={current.page <= 1 || busy} onClick={() => patch(tab, { page: current.page - 1 })}><ChevronLeft size={14} /></button>
            {pageWindow(current.page, pages).map((p, i) => p === '…' ? <span key={`gap-${i}`} className="pssc-gap">…</span>
              : <button key={p} type="button" className="pssc-page" aria-current={p === current.page ? 'page' : undefined} disabled={busy && p !== current.page} onClick={() => patch(tab, { page: p })}>{p}</button>)}
            <button type="button" className="pssc-page" aria-label="Halaman berikutnya" disabled={current.page >= pages || busy} onClick={() => patch(tab, { page: current.page + 1 })}><ChevronRight size={14} /></button>
          </nav>
        </footer>
      </section>

      <div className="pssc-toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className="pssc-toast" data-tone={t.tone}>{t.tone === 'ok' ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}{t.text}</div>)}</div>
    </div>
  );
}
