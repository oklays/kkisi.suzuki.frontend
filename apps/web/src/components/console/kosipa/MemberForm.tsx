'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Copy, Info } from 'lucide-react';
import { useHydrated } from '../../use-hydrated';
import { useFlash } from './member-flash';
import { BANK_FIELDS, MEMBER_FIELD_GROUPS, MEMBER_MESSAGES, MEMBER_STATUS_OPTIONS, RETRY_SAME_KEY, type MemberFieldConfig } from './member-form-config';

type Props = {
  mode: 'register' | 'edit';
  memberId?: number;
  /** Stored values (edit) as text; null/absent = empty. */
  initial?: Record<string, string | null>;
  /** Opaque server version (edit). */
  version?: string;
  bagian: readonly string[];
  lokasi: readonly string[];
  csrfToken: string;
  /** Owned by Next.js AND legacy controllers fenced AND the caller may submit. */
  canSubmit: boolean;
};

async function send(method: 'POST' | 'PATCH', path: string, csrfToken: string, body: unknown): Promise<{ ok: boolean; code: string; data?: { id?: number } }> {
  try {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body), cache: 'no-store' });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, code: typeof json.error === 'string' ? json.error : '', data: json.data };
  } catch { return { ok: false, code: 'NETWORK' }; }
}
const numeric = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * Member registration and profile form. The server enforces every rule; this collects input and sends ONLY what changed on edit. One idempotency key
 * per attempt: a retry after a timeout or BUSY_RETRY resends the same key (never a second member); any edit of the form starts a new attempt.
 */
export function MemberForm({ mode, memberId, initial = {}, version, bagian, lokasi, csrfToken, canSubmit }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const editing = mode === 'edit';
  const [busy, setBusy] = useState(false);
  const [message, setMessage, remember] = useFlash('form');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const g of MEMBER_FIELD_GROUPS) for (const f of g.fields) out[f.key] = initial[f.key] ?? (f.key === 'kd_group' ? 'ANGGOTA' : '');
    return out;
  });
  const [status, setStatus] = useState<string>('AKTIVE');
  const [deductions, setDeductions] = useState({ pokok: '0', wajib: '0', sukarela: '0' });
  const [reason, setReason] = useState('');
  const attempt = useRef<{ form: string; key: string } | null>(null);

  const visible = (f: MemberFieldConfig) => (editing ? !f.registerOnly : true);
  const changed = (f: MemberFieldConfig) => {
    const now = values[f.key] ?? '', before = initial[f.key] ?? '';
    return f.kind === 'amount' ? numeric(now) !== numeric(before) : now !== before;
  };
  const changedKeys = MEMBER_FIELD_GROUPS.flatMap((g) => g.fields).filter((f) => visible(f) && changed(f)).map((f) => f.key);
  const bankChanged = changedKeys.some((k) => (BANK_FIELDS as readonly string[]).includes(k));

  function keyFor(form: string): string {
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    return attempt.current.key;
  }
  async function submit() {
    setBusy(true); setMessage(null);
    let body: Record<string, unknown>;
    if (editing) {
      body = { fields: Object.fromEntries(changedKeys.map((k) => [k, values[k]])), expectedVersion: version, ...(bankChanged || reason.trim() ? { reason } : {}) };
    } else {
      const fields = Object.fromEntries(MEMBER_FIELD_GROUPS.flatMap((g) => g.fields).filter((f) => values[f.key] !== '').map((f) => [f.key, values[f.key]]));
      body = { fields: { ...fields, status_anggota: status }, initialDeductions: deductions };
    }
    const form = `${mode}:${memberId ?? 'new'}:${JSON.stringify(body)}`;
    const result = await send(editing ? 'PATCH' : 'POST', editing ? `/api/kosipa/members/${memberId}` : '/api/kosipa/members', csrfToken, { ...body, idempotencyKey: keyFor(form) });
    setBusy(false);
    if (!RETRY_SAME_KEY.has(result.code)) attempt.current = null;
    if (result.ok) {
      setMessage({ kind: 'ok', text: editing ? 'Perubahan disimpan.' : 'Anggota didaftarkan.' });
      if (editing) { remember('Perubahan disimpan.'); router.refresh(); } else if (result.data?.id) router.push(`/console/kosipa/anggota/${result.data.id}`);
    } else setMessage({ kind: 'error', text: MEMBER_MESSAGES[result.code] ?? 'Perubahan tidak dapat disimpan.' });
  }

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const allFields = MEMBER_FIELD_GROUPS.flatMap((g) => g.fields).filter(visible);
  const requiredFields = allFields.filter((f) => f.required);
  const missing = requiredFields.filter((f) => (values[f.key] ?? '').trim() === '');
  const changedFields = allFields.filter(changed);
  const locked = !hydrated || !canSubmit;
  /** One-time copy of the KTP address into the residence fields; both stay editable afterwards. */
  function copyKtpAddress() {
    setValues((v) => ({ ...v, alamat_tinggal: v.alamat ?? '', kelurahan_tinggal: v.kelurahan ?? '', kecamatan_tinggal: v.kecamatan ?? '', kabupaten_tinggal: v.kabupaten ?? '', kode_pos_tinggal: v.kode_pos ?? '' }));
  }
  function jumpTo(key: string) {
    const el = document.getElementById(`member-${key}`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
  }
  function input(f: MemberFieldConfig) {
    const id = `member-${f.key}`;
    const common = { id, name: f.key, value: values[f.key] ?? '', disabled: !hydrated || !canSubmit, 'aria-describedby': f.hint ? `${id}-hint` : undefined };
    if (f.kind === 'select') {
      const opts = f.key === 'bagian' ? bagian : f.key === 'lokasi' ? lokasi : (f.options ?? []);
      const current = values[f.key] ?? '';
      const extra = current && !opts.includes(current) ? [current] : [];
      return <select {...common} required={f.required} onChange={(e) => set(f.key, e.target.value)}>
        {!current && <option value="">Pilih...</option>}
        {[...extra, ...opts].map((o) => <option key={o} value={o}>{extra.includes(o) ? `${o} (tidak aktif)` : o}</option>)}
      </select>;
    }
    if (f.kind === 'textarea') return <textarea {...common} maxLength={f.max} rows={2} onChange={(e) => set(f.key, e.target.value)} />;
    return <input {...common} type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'amount' ? 'decimal' : undefined} required={f.required} maxLength={f.kind === 'date' ? undefined : f.max} autoComplete="off" onChange={(e) => set(f.key, e.target.value)} />;
  }

  return (
    <form className="mform" aria-label={editing ? 'Ubah profil anggota' : 'Daftarkan anggota'} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="mform-main">
        {MEMBER_FIELD_GROUPS.map((g) => {
          const fields = g.fields.filter(visible);
          if (!fields.length) return null;
          return (
            <section key={g.id} className="mform-group" role="group" aria-labelledby={`mform-${g.id}`}>
              <header>
                <h2 id={`mform-${g.id}`}>{g.title}</h2>
                {g.id === 'tinggal' && <button type="button" className="mform-link" disabled={locked} onClick={copyKtpAddress}><Copy size={14} aria-hidden="true" />Salin dari alamat KTP</button>}
              </header>
              <div className="mform-grid">
                {fields.map((f) => (
                  <label key={f.key} className={f.kind === 'textarea' ? 'mform-wide' : undefined} htmlFor={`member-${f.key}`} data-changed={editing && changed(f) ? 'true' : undefined}>
                    <span>{f.label}{f.required && <b aria-hidden="true"> *</b>}{editing && changed(f) && <em> diubah</em>}</span>
                    {input(f)}
                    {f.hint && <small id={`member-${f.key}-hint`}>{f.hint}</small>}
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <aside className="mform-rail" aria-label={editing ? 'Ringkasan perubahan' : 'Ringkasan pendaftaran'}>
        {editing ? (
          <>
            <h2>Perubahan</h2>
            {changedFields.length === 0
              ? <p className="mform-muted">Belum ada perubahan.</p>
              : <ul className="mform-changes">{changedFields.map((f) => <li key={f.key}><button type="button" className="mform-link" onClick={() => jumpTo(f.key)}>{f.label}</button></li>)}</ul>}
            {bankChanged && (
              <label htmlFor="member-reason" className="mform-reason"><span>Alasan perubahan rekening bank <b aria-hidden="true">*</b></span>
                <input id="member-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required disabled={locked} placeholder="Mis. koreksi sesuai buku tabungan" autoComplete="off" />
                <small>Wajib; tersimpan di buku besar perintah, tidak di audit konsol.</small>
              </label>
            )}
          </>
        ) : (
          <>
            <h2>Ringkasan</h2>
            <div className="mform-progress">
              <div className="mform-progress-bar" role="progressbar" aria-label="Isian wajib terisi" aria-valuemin={0} aria-valuemax={requiredFields.length} aria-valuenow={requiredFields.length - missing.length}><span style={{ width: `${requiredFields.length ? ((requiredFields.length - missing.length) / requiredFields.length) * 100 : 0}%` }} /></div>
              <p><b>{requiredFields.length - missing.length}</b> dari {requiredFields.length} isian wajib terisi</p>
              {missing.length > 0 && <ul className="mform-missing" aria-label="Isian wajib yang belum diisi">{missing.map((f) => <li key={f.key}><button type="button" className="mform-link" onClick={() => jumpTo(f.key)}>{f.label}</button></li>)}</ul>}
            </div>
            <div className="mform-rail-block">
              <h3>Status awal</h3>
              <label htmlFor="member-status-awal"><span>Status anggota <b aria-hidden="true">*</b></span>
                <select id="member-status-awal" value={status} disabled={locked} onChange={(e) => setStatus(e.target.value)}>{MEMBER_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              </label>
            </div>
            <div className="mform-rail-block">
              <h3>Potongan payroll awal <small>per bulan, Rp</small></h3>
              <div className="mform-deductions">
                {(['pokok', 'wajib', 'sukarela'] as const).map((k) => (
                  <label key={k} htmlFor={`member-ded-${k}`}><span>Simpanan {k}</span>
                    <input id={`member-ded-${k}`} inputMode="decimal" value={deductions[k]} disabled={locked} required onChange={(e) => setDeductions((d) => ({ ...d, [k]: e.target.value }))} autoComplete="off" />
                  </label>
                ))}
              </div>
              <small>Isi 0 bila tidak ada. Potongan hanya dapat dibuat untuk NIK sampai 10 karakter.</small>
            </div>
            <p className="mform-auto"><Info size={14} aria-hidden="true" />Nomor registrasi dan nomor anggota dibuat otomatis. Batas kredit awal nol dan akun mobile tidak dibuat.</p>
          </>
        )}
        {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        <div className="mform-submit">
          <button type="submit" disabled={busy || locked || (editing && changedKeys.length === 0)}>{editing ? `Simpan perubahan${changedKeys.length ? ` (${changedKeys.length})` : ''}` : 'Daftarkan anggota'}</button>
        </div>
      </aside>
    </form>
  );
}
