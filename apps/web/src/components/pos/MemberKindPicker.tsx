"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown, CreditCard, Hash, IdCard, QrCode } from "lucide-react";
import "./member-kind-picker.css";

const methods = [
  { value: "nik", label: "NIK karyawan", description: "Nomor induk karyawan", Icon: IdCard },
  { value: "card", label: "ID card", description: "Scan kartu identitas", Icon: CreditCard },
  { value: "id", label: "ID anggota", description: "Nomor anggota koperasi", Icon: Hash },
  { value: "qr", label: "QR terenkripsi", description: "Scan kode QR anggota", Icon: QrCode },
];

export function MemberKindPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const selected = methods.find(method => method.value === value) ?? methods[0];

  useEffect(() => {
    if (disabled) menu.current?.hidePopover();
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!(event.target instanceof Node && menu.current?.contains(event.target))) menu.current?.hidePopover();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [disabled, open]);

  function positionMenu() {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(276, window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const upward = below < 270 && above > below;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: upward ? "auto" : rect.bottom + 8,
      bottom: upward ? window.innerHeight - rect.top + 8 : "auto",
      width,
      maxHeight: Math.max(80, upward ? above : below),
    });
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("[role=option]"));
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    let next;
    if (event.key === "ArrowDown") next = (current + 1) % options.length;
    else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    if (next !== undefined) { event.preventDefault(); options[next].focus(); }
  }

  return <div className="pos-kind-picker">
    <button ref={trigger} type="button" className="pos-kind-trigger" aria-label="Jenis scan anggota" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} disabled={disabled} popoverTarget={id} onClick={positionMenu} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); positionMenu(); menu.current?.showPopover(); }
    }}>
      <selected.Icon size={16} aria-hidden="true" /><span>{selected.label}</span><ChevronDown className="pos-kind-chevron" size={14} aria-hidden="true" />
    </button>
    <div ref={menu} id={id} className="pos-kind-menu" popover="auto" style={position} role="listbox" aria-label="Jenis scan anggota" onKeyDown={navigate} onToggle={event => {
      const expanded = event.newState === "open";
      setOpen(expanded);
      if (expanded) menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) menu.current?.hidePopover(); }}>
      <p className="pos-kind-menu-heading" aria-hidden="true">Metode pencarian</p>
      {methods.map(({ value: optionValue, label, description, Icon }) => <button key={optionValue} type="button" role="option" aria-label={label} aria-selected={value === optionValue} tabIndex={value === optionValue ? 0 : -1} disabled={disabled} onClick={() => {
        onChange(optionValue); menu.current?.hidePopover(); trigger.current?.focus();
      }}>
        <span className="pos-kind-option-icon" aria-hidden="true"><Icon size={19} /></span>
        <span className="pos-kind-option-copy"><strong>{label}</strong><small>{description}</small></span>
        {value === optionValue && <Check className="pos-kind-check" size={17} aria-hidden="true" />}
      </button>)}
    </div>
  </div>;
}
