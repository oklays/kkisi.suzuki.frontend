'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import type { ProductField, ProductMasterDefinition } from '@koperasi/domain/kosipa/product-master';
import type { ProductFormFacts } from '@koperasi/application/kosipa/commands/product-master';
import { useHydrated } from '../../use-hydrated';
import { useFlash } from './member-flash';
import { PRODUCT_FORM_GROUPS, PRODUCT_MESSAGES, PRODUCT_RETRY_SAME_KEY } from './product-master-ui';

type Props = {
  definition: ProductMasterDefinition;
  facts: ProductFormFacts;
  mode: 'create' | 'edit';
  row?: { id: number; values: Record<string, string>; version: string };
  csrfToken: string;
  /** Owned by Next.js AND legacy fenced AND the caller holds the master-manage grant. */
  canSubmit: boolean;
};

const canonical = (v: string) => (/^\d+(\.\d+)?$/.test(v) ? v.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : v);
const defaultFor = (f: ProductField): string =>
  f.kind === 'decimal' || f.kind === 'flag' || f.kind === 'parent' ? '0' : f.kind === 'enum' && f.options?.length === 1 ? f.options[0] : '';

/**
 * Create / edit form of one product master (FA-03B T06), in the console form standard (mform: field groups + summary rail). The server enforces every
 * rule; this sends ONLY the definition's fields (never derived COA descriptions or status) with one idempotency key per attempt. Changing a financial
 * field shows the FD-32 warning and requires a reason before the form can be sent.
 */
export function ProductMasterForm({ definition, facts, mode, row, csrfToken, canSubmit }: Props) {
  const router = useRouter();
  const hydrated = useHydrated();
  const editing = mode === 'edit';
  const locked = !hydrated || !canSubmit;
  const initial = row?.values ?? {};
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(definition.fields.map((f) => [f.key, initial[f.key] ?? defaultFor(f)])));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage, remember] = useFlash('form');
  const [invalid, setInvalid] = useState<string | null>(null);
  const attempt = useRef<{ form: string; key: string } | null>(null);
  const base = `/api/kosipa/master/${definition.type}`;

  const changedFields = editing ? definition.fields.filter((f) => canonical(values[f.key] ?? '') !== canonical(initial[f.key] ?? '')) : [];
  const financial = changedFields.some((f) => f.financial);
  const requiredMissing = definition.fields.filter((f) => f.required && !(values[f.key] ?? '').trim());
  const groups = PRODUCT_FORM_GROUPS[definition.type];
  const placed = new Set(groups.flatMap((g) => g.keys));
  const sections = groups.map((g, i) => ({ ...g, fields: [...g.keys, ...(i === groups.length - 1 ? definition.fields.map((f) => f.key).filter((k) => !placed.has(k)) : [])].map((k) => definition.fields.find((f) => f.key === k)).filter((f): f is ProductField => !!f) }));

  const set = (key: string, value: string) => { setValues((v) => ({ ...v, [key]: value })); if (invalid === key) setInvalid(null); };
  function jumpTo(key: string) { const el = document.getElementById(`pm-${key}`); el?.scrollIntoView({ block: 'center' }); el?.focus(); }

  async function submit() {
    setBusy(true); setMessage(null); setInvalid(null);
    const body = editing ? { values, expectedVersion: row?.version, ...(reason.trim() ? { reason } : {}) } : { values };
    const form = `${mode}:${row?.id ?? 'new'}:${JSON.stringify(body)}`;
    if (attempt.current?.form !== form) attempt.current = { form, key: crypto.randomUUID() };
    let ok = false, code = '', field: string | null = null, data: { id?: number } | undefined;
    try {
      const r = await fetch(editing ? `${base}/${row?.id}` : base, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, cache: 'no-store', body: JSON.stringify({ ...body, idempotencyKey: attempt.current.key }) });
      const json = await r.json().catch(() => ({}));
      ok = r.ok; code = typeof json.error === 'string' ? json.error : ''; field = typeof json.field === 'string' ? json.field : null; data = json.data;
    } catch { code = 'NETWORK'; }
    setBusy(false);
    if (!PRODUCT_RETRY_SAME_KEY.has(code)) attempt.current = null;
    if (ok) {
      remember(editing ? 'Perubahan disimpan.' : 'Data ditambahkan.');
      if (editing) { setMessage({ kind: 'ok', text: 'Perubahan disimpan.' }); router.refresh(); } else if (data?.id) router.push(`/console/kosipa/master/${definition.type}/${data.id}/ubah`);
      return;
    }
    const label = field ? definition.fields.find((f) => f.key === field)?.label : undefined;
    setMessage({ kind: 'error', text: `${label ? `${label}: ` : ''}${PRODUCT_MESSAGES[code] ?? 'Perubahan tidak dapat disimpan.'}` });
    if (field) { setInvalid(field); jumpTo(field); }
  }

  function control(f: ProductField) {
    const common = { id: `pm-${f.key}`, name: f.key, value: values[f.key] ?? '', disabled: locked || (editing && f.change === 'never'), 'aria-invalid': invalid === f.key ? true : undefined, 'aria-describedby': `pm-${f.key}-hint` };
    const options = (list: readonly { value: string; label: string }[], placeholder?: string) => {
      const current = values[f.key] ?? '';
      const extra = current && !list.some((o) => o.value === current) ? [{ value: current, label: `${current} (tidak tersedia)` }] : [];
      return <select {...common} required={f.required} onChange={(e) => set(f.key, e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {[...extra, ...list].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>;
    };
    switch (f.kind) {
      case 'enum': return options((f.options ?? []).map((o) => ({ value: o, label: o })), values[f.key] ? undefined : 'Pilih...');
      case 'flag': return options([{ value: '0', label: 'Tidak' }, { value: '1', label: 'Ya' }]);
      case 'parent': return options([{ value: '0', label: 'Jenis induk (tanpa induk)' }, ...facts.parents.filter((p) => p.id !== row?.id).map((p) => ({ value: String(p.id), label: `${p.code} · ${p.name}` }))]);
      case 'financing': return options(facts.financing.filter((x) => x.active).map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` })), 'Pilih...');
      case 'coa': return options(facts.coa.map((c) => ({ value: c.code, label: `${c.code} · ${c.desc}${c.group ? ' (kelompok)' : ''}` })), f.required ? 'Pilih akun...' : 'Tidak ada');
      default: return <input {...common} type="text" inputMode={f.kind === 'decimal' ? 'decimal' : f.kind === 'int' ? 'numeric' : undefined} required={f.required} maxLength={f.max} autoComplete="off" onChange={(e) => set(f.key, e.target.value)} />;
    }
  }
  function hint(f: ProductField): string | null {
    if (f.kind === 'coa') {
      const c = facts.coa.find((x) => x.code === values[f.key]);
      if (!c) return f.hint ?? null;
      return c.desc.length > (f.descMax ?? 50) ? `Deskripsi akun (${c.desc.length} karakter) melebihi kolom ${f.descMax}: server akan menolak.` : `Deskripsi tersimpan otomatis: ${c.desc}`;
    }
    if (f.kind === 'decimal') return `Angka, titik desimal, maks. ${f.scale} digit desimal.`;
    if (editing && f.change === 'never') return 'Tetap sejak dibuat.';
    return f.hint ?? null;
  }

  return (
    <form className="mform" aria-label={editing ? `Ubah ${definition.title}` : `Tambah ${definition.title}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="mform-main">
        {sections.map((g) => (
          <section key={g.id} className="mform-group" role="group" aria-labelledby={`pm-group-${g.id}`}>
            <header><h2 id={`pm-group-${g.id}`}>{g.title}</h2></header>
            <div className="mform-grid">
              {g.fields.map((f) => {
                const changed = changedFields.includes(f);
                const text = hint(f);
                return (
                  <label key={f.key} htmlFor={`pm-${f.key}`} data-changed={changed ? 'true' : undefined}>
                    <span>{f.label}{f.required && <b aria-hidden="true"> *</b>}{changed && <em> diubah</em>}</span>
                    {control(f)}
                    {text && <small id={`pm-${f.key}-hint`}>{text}</small>}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <aside className="mform-rail" aria-label={editing ? 'Ringkasan perubahan' : 'Ringkasan isian'}>
        {editing ? (
          <>
            <h2>Perubahan</h2>
            {changedFields.length === 0
              ? <p className="mform-muted">Belum ada perubahan.</p>
              : <ul className="mform-changes">{changedFields.map((f) => <li key={f.key}><button type="button" className="mform-link" onClick={() => jumpTo(f.key)}>{f.label}</button></li>)}</ul>}
            {financial && (
              <>
                <p className="mform-auto product-warning" role="note"><TriangleAlert size={14} aria-hidden="true" />{definition.financialWarning}</p>
                <label htmlFor="pm-reason" className="mform-reason"><span>Alasan perubahan parameter keuangan <b aria-hidden="true">*</b></span>
                  <input id="pm-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={200} required disabled={locked} placeholder="Mis. penyesuaian tarif per rapat pengurus" autoComplete="off" />
                  <small>Wajib; tersimpan di buku besar perintah, tidak di audit konsol.</small>
                </label>
              </>
            )}
          </>
        ) : (
          <>
            <h2>Ringkasan</h2>
            <div className="mform-progress">
              <div className="mform-progress-bar" role="progressbar" aria-label="Isian wajib terisi" aria-valuemin={0} aria-valuemax={definition.fields.filter((f) => f.required).length} aria-valuenow={definition.fields.filter((f) => f.required).length - requiredMissing.length}>
                <span style={{ width: `${Math.round(100 * (1 - requiredMissing.length / Math.max(1, definition.fields.filter((f) => f.required).length)))}%` }} />
              </div>
              <p><b>{definition.fields.filter((f) => f.required).length - requiredMissing.length}</b> dari {definition.fields.filter((f) => f.required).length} isian wajib terisi</p>
              {requiredMissing.length > 0 && <ul className="mform-missing" aria-label="Isian wajib yang belum diisi">{requiredMissing.map((f) => <li key={f.key}><button type="button" className="mform-link" onClick={() => jumpTo(f.key)}>{f.label}</button></li>)}</ul>}
            </div>
            <p className="mform-auto"><Info size={14} aria-hidden="true" />Data baru langsung aktif. Deskripsi akun COA diisi otomatis dari bagan akun. Tidak ada penghapusan permanen; gunakan nonaktifkan.</p>
          </>
        )}
        {message && <p className={message.kind === 'error' ? 'console-message console-message-error' : 'console-message'} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        <div className="mform-submit">
          <button type="submit" disabled={busy || locked || (editing && changedFields.length === 0) || (financial && reason.trim().length < 5)}>
            {editing ? `Simpan perubahan${changedFields.length ? ` (${changedFields.length})` : ''}` : 'Simpan'}
          </button>
        </div>
      </aside>
    </form>
  );
}
