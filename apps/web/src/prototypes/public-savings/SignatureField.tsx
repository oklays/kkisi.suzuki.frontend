'use client';

import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { SignaturePoint as Point } from './types.ts';
const sample: Point[][] = [[{x:90,y:125},{x:140,y:55},{x:120,y:125},{x:190,y:95},{x:170,y:115},{x:245,y:80},{x:220,y:115},{x:320,y:100},{x:290,y:130},{x:440,y:95}]];

export function SignatureField({ value: strokes, onChange, error, disabled = false }: {value: Point[][]; onChange(strokes: Point[][]): void; error?: string; disabled?: boolean}) {
  const id = useId();
  const [pending, setPending] = useState<Point[]>([]);
  const current = useRef<Point[] | null>(null);
  function point(event: PointerEvent<SVGSVGElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return {x: Math.max(0, Math.min(600, (event.clientX-box.left)*600/box.width)), y: Math.max(0, Math.min(180, (event.clientY-box.top)*180/box.height))};
  }
  function finish() {
    const stroke = current.current;
    current.current = null;
    setPending([]);
    if (stroke && stroke.length > 1) onChange([...strokes, stroke]);
  }
  return <div className="ps-signature">
    <div className="ps-field-label" id={`${id}-label`}>Tanda tangan simulasi <span aria-hidden="true">*</span></div>
    <p id={`${id}-hint`} className="ps-help">Gambar dengan jari atau mouse. Untuk mencoba tanpa menggambar, gunakan tanda tangan contoh.</p>
    <svg viewBox="0 0 600 180" role="img" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} className="ps-signature-pad"
      onPointerDown={event => {if (disabled || !event.isPrimary) return; event.currentTarget.setPointerCapture(event.pointerId); current.current=[point(event)]; setPending([...current.current]);}}
      onPointerMove={event => {if (!current.current || disabled) return; current.current.push(point(event)); setPending([...current.current]);}}
      onPointerUp={finish} onPointerCancel={() => {current.current=null;setPending([]);}}>
      <line x1="30" x2="570" y1="145" y2="145" stroke="#c4cfdd" strokeDasharray="5 5" />
      {[...strokes, ...(pending.length ? [pending] : [])].map((stroke,index) => <polyline key={index} points={stroke.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#003399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
      {strokes.length===0 && pending.length===0 && <text x="300" y="85" textAnchor="middle" fill="#64748b" fontSize="16">Area tanda tangan contoh</text>}
    </svg>
    <div className="ps-signature-actions">
      <button type="button" className="ps-text-button" disabled={disabled} onClick={() => {current.current=null;setPending([]);onChange(sample);}}>Gunakan contoh tanda tangan</button>
      <button type="button" className="ps-text-button" disabled={disabled || strokes.length===0} onClick={() => {current.current=null;setPending([]);onChange([]);}}>Hapus tanda tangan</button>
    </div>
    <span className="ps-help">Contoh ini bukan bukti persetujuan yang sah.</span>
    {error && <p className="ps-field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}
