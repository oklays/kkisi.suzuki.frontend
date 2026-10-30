'use client';

import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { draftRupiahInput, parseRupiahInput, rupiahInputText, type ParseRupiahOptions } from './format.ts';
import './money.css';

export interface CurrencyInputProps extends ParseRupiahOptions {
  /** Controlled canonical amount ("1250000.75"), or "" for an empty field. Empty is never turned into zero. */
  value?: string;
  /** Uncontrolled initial amount (same canonical form); pair with `name` so a native form posts it. */
  defaultValue?: string;
  /** Receives the canonical dot-decimal amount, or "" while the field is empty / incomplete. Never the formatted text. */
  onValueChange?: (canonical: string) => void;
  id?: string;
  /** When set, a hidden input posts the canonical amount under this name (the visible text is never submitted). */
  name?: string;
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean | 'true' | 'false';
  onBlur?: () => void;
}

interface Field { text: string; canonical: string }

// What the user "means" by a text: its digits and comma, with leading zeros ignored. Used to tell whether an edit lost anything.
const essence = (text: string) => text.replace(/[^0-9,\-−]/g, '').replace(/^([-−]?)0+(?=\d)/, '$1');
const significant = (text: string) => text.replace(/[^0-9,\-−]/g, '').length;
function caretAfter(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (/[0-9,\-−]/.test(text[index]) && ++seen === count) return index + 1;
  }
  return text.length;
}

/**
 * Rupiah text field: a separate `Rp` prefix, live `1.250.000,75` grouping, a numeric keyboard on phones, and a canonical
 * value ("1250000.75") for state and requests. Typing re-groups without moving the caret; paste is parsed strictly so
 * `4.000.50` or `1,250,000` is refused with a message instead of being reinterpreted as a different amount.
 */
export function CurrencyInput({
  value: controlledValue, defaultValue = '', onValueChange, id, name, className, wrapperClassName, placeholder, disabled, readOnly, required, autoFocus, onBlur,
  allowDecimals = true, maxFractionDigits = 2, allowNegative = false, maxIntegerDigits,
  'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired,
}: CurrencyInputProps) {
  const options: ParseRupiahOptions = { allowDecimals, maxFractionDigits, allowNegative, maxIntegerDigits };
  const generated = useId();
  const noteId = `${id ?? generated}-note`;
  const hintId = `${id ?? generated}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlledValue ?? uncontrolled;
  const [field, setField] = useState<Field>({ text: rupiahInputText(value), canonical: value });
  const [note, setNote] = useState('');

  // A value that did not come from this field (reset, margin calculation, loaded record) replaces the text.
  if (value !== field.canonical) setField({ text: rupiahInputText(value), canonical: value });

  useLayoutEffect(() => {
    const element = input.current;
    if (caret.current !== null && element && document.activeElement === element) element.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  function commit(draftText: string, canonical: string | null, caretCount: number | null) {
    caret.current = caretCount === null ? null : caretAfter(draftText, caretCount);
    setField({ text: draftText, canonical: canonical ?? '' });
    if ((canonical ?? '') !== value) {
      if (controlledValue === undefined) setUncontrolled(canonical ?? '');
      onValueChange?.(canonical ?? '');
    }
  }

  function edit(raw: string, caretCount: number | null) {
    const draft = draftRupiahInput(raw, options);
    // Never change what the user typed without saying so: a refused comma or a dropped digit must not read as a different amount.
    const comma = raw.indexOf(',');
    const typedDecimals = comma === -1 ? 0 : raw.slice(comma + 1).replace(/\D/g, '').length;
    const typedInteger = (comma === -1 ? raw : raw.slice(0, comma)).replace(/\D/g, '').replace(/^0+/, '').length;
    if (!allowDecimals && comma !== -1) setNote('Nominal harus rupiah bulat, tanpa desimal. Koma diabaikan.');
    else if (allowDecimals && typedDecimals > maxFractionDigits) setNote(`Maksimal ${maxFractionDigits} angka di belakang koma.`);
    else if (maxIntegerDigits !== undefined && typedInteger > maxIntegerDigits) setNote(`Maksimal ${maxIntegerDigits} digit.`);
    else setNote('');
    commit(draft.text, draft.canonical, caretCount);
  }

  function replaceSelection(insert: string, strict: boolean) {
    const element = input.current;
    if (!element || readOnly || disabled) return;
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const raw = element.value.slice(0, start) + insert + element.value.slice(end);
    const draft = draftRupiahInput(raw, options);
    if (strict && essence(raw.replace(/\./g, '')) !== essence(draft.text.replace(/\./g, ''))) {
      setNote(allowDecimals ? 'Hasil tempel melebihi batas nominal atau mengandung lebih dari satu koma desimal.' : 'Hasil tempel melebihi batas nominal.');
      return;
    }
    setNote('');
    commit(draft.text, draft.canonical, significant(element.value.slice(0, start) + insert));
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const parsed = parseRupiahInput(event.clipboardData.getData('text'), options);
    if (!parsed.ok) { setNote(parsed.message); return; }
    if (parsed.value === null) return;
    replaceSelection(rupiahInputText(parsed.value), true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const element = event.currentTarget;
    if (event.key === '.' || (event.key === ',' && !allowDecimals)) {
      // Dots are only ever added by the grouping; a typed dot is a decimal separator for people used to a US keypad.
      event.preventDefault();
      if (allowDecimals) replaceSelection(',', false);
      else setNote('Nominal harus rupiah bulat, tanpa desimal.');
      return;
    }
    const at = element.selectionStart;
    if (at === null || at !== element.selectionEnd) return;
    // Step over a grouping dot so Backspace / Delete removes the neighbouring digit instead of re-adding the dot.
    if (event.key === 'Backspace' && element.value[at - 1] === '.') element.setSelectionRange(at - 1, at - 1);
    if (event.key === 'Delete' && element.value[at] === '.') element.setSelectionRange(at + 1, at + 1);
  }

  function handleBlur() {
    // The refusal note stays until the next edit: clearing it here would shift the layout mid-click and swallow the click.
    const tidy = field.text.replace(/,$/, '').replace(/^[-−]$/, '');
    if (tidy !== field.text) setField({ text: tidy, canonical: field.canonical });
    onBlur?.();
  }

  const describedBy = [ariaDescribedBy, hintId, note ? noteId : ''].filter(Boolean).join(' ');
  return (
    <>
      <span className={`money-input${wrapperClassName ? ` ${wrapperClassName}` : ''}`} data-invalid={ariaInvalid || note ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
        <span className="money-input-prefix" aria-hidden="true">Rp</span>
        <input
          ref={input} id={id} data-field={name} type="text" inputMode={allowDecimals ? 'decimal' : 'numeric'} enterKeyHint="done" autoComplete="off" spellCheck={false}
          className={className} value={field.text} placeholder={placeholder} disabled={disabled} readOnly={readOnly} required={required} autoFocus={autoFocus}
          aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-describedby={describedBy} aria-invalid={ariaInvalid || note ? true : undefined} aria-required={ariaRequired}
          onChange={(event) => edit(event.target.value, event.target.selectionStart === null ? null : significant(event.target.value.slice(0, event.target.selectionStart)))}
          onPaste={onPaste} onKeyDown={onKeyDown} onBlur={handleBlur}
          onDrop={(event) => event.preventDefault()}
        />
        {name ? <input type="hidden" name={name} value={field.canonical} /> : null}
      </span>
      <span id={hintId} hidden>Jumlah dalam Rupiah. Titik memisahkan ribuan{allowDecimals ? ', koma untuk desimal' : ', tanpa desimal'}.</span>
      {note ? <span id={noteId} className="money-input-note" role="alert">{note}</span> : null}
    </>
  );
}
