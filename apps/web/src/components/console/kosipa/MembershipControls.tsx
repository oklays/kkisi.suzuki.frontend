'use client';

import { useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/** The surrounding private form is submitted through requestSubmit(), so PrivateWorkspace posts it like a normal submit (search text never enters the URL). */
const submitForm = (element: HTMLElement | null) => element?.closest('form')?.requestSubmit();

/**
 * Search box. The workspace disables the whole form while a request is running, which would drop keyboard focus on every
 * keystroke of a type-ahead search, so a search runs on Enter or on the "Cari" button. The submit button comes first in the form
 * so that Enter never triggers "Reset".
 */
export function MembershipSearchField({ defaultValue }: { defaultValue: string }) {
  const [field, setField] = useState({ synced: defaultValue, value: defaultValue });
  const input = useRef<HTMLInputElement>(null);
  // "Reset" (or any server-side normalisation) is reflected in the box: adjust state while rendering when the server value changed.
  if (field.synced !== defaultValue) setField({ synced: defaultValue, value: defaultValue });
  const { value } = field;
  const setValue = (next: string) => setField((f) => ({ ...f, value: next }));
  return <div className="membership-search">
    <Search size={18} aria-hidden="true" />
    <input ref={input} id="member-q" name="q" type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Cari NIK atau nama anggota..." maxLength={50} autoComplete="off" aria-label="Cari NIK atau nama anggota" />
    {value && <button type="button" className="membership-search-clear" aria-label="Hapus pencarian" onClick={() => { setValue(''); if (input.current) input.current.value = ''; submitForm(input.current); }}><X size={16} aria-hidden="true" /></button>}
    <button type="submit" className="membership-search-submit">Cari</button>
  </div>;
}

/** A native select that applies itself on change (the page returns to the first page because no page field is posted). `key` remounts it when the server value changes, e.g. after "Reset". */
export function MembershipSelect({ name, label, value, options, prefix }: { name: string; label: string; value: string; options: readonly { value: string; label: string }[]; prefix?: string }) {
  return <label className="membership-select">
    <span className="membership-select-label">{prefix ?? label}:</span>
    <select key={value} name={name} defaultValue={value} aria-label={label} onChange={(event) => submitForm(event.currentTarget)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>;
}

/** Page-size picker for the table footer; applies on change and returns to page 1. */
export function MembershipPageSize({ value, sizes }: { value: number; sizes: readonly number[] }) {
  return <label className="membership-page-size">
    <span>Tampilkan</span>
    <select key={value} name="size" defaultValue={String(value)} aria-label="Jumlah data per halaman" onChange={(event) => submitForm(event.currentTarget)}>
      {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  </label>;
}
