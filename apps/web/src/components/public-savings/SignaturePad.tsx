'use client';

import { useRef } from 'react';
import type { PointerEvent, RefObject } from 'react';

export function SignaturePad({ canvasRef, onChange, disabled }: { canvasRef: RefObject<HTMLCanvasElement | null>; onChange(value: boolean): void; disabled: boolean }) {
  const drawing = useRef<{ x: number; y: number; pointer: number } | null>(null);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX-box.left)*600/box.width, y: (event.clientY-box.top)*180/box.height };
  }
  function finish() { drawing.current=null; }
  return <div className="pss-signature">
    <label id="pss-sign-label">Tanda tangan <span aria-hidden="true">*</span></label>
    <p id="pss-sign-hint" className="pss-help">Gambar tanda tangan Anda dengan jari, pena, atau mouse. Jika kesulitan menandatangani, hubungi petugas koperasi.</p>
    <canvas ref={canvasRef} width={600} height={180} role="img" aria-labelledby="pss-sign-label" aria-describedby="pss-sign-hint" className="pss-pad"
      onPointerDown={event=>{ if(disabled || !event.isPrimary || event.button!==0) return; event.currentTarget.setPointerCapture(event.pointerId); drawing.current={...point(event),pointer:event.pointerId}; }}
      onPointerMove={event=>{ const previous=drawing.current; if(disabled || !previous || previous.pointer!==event.pointerId) return;
        const next=point(event); const context=event.currentTarget.getContext('2d'); if(!context) return;
        context.strokeStyle='#003399'; context.lineWidth=2.5; context.lineCap='round'; context.lineJoin='round'; context.beginPath(); context.moveTo(previous.x,previous.y); context.lineTo(next.x,next.y); context.stroke();
        drawing.current={...next,pointer:event.pointerId}; onChange(true);
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>Area tanda tangan. Gunakan perangkat dengan layar sentuh atau mouse.</canvas>
    <button type="button" className="pss-text-button" disabled={disabled} onClick={()=>{canvasRef.current?.getContext('2d')?.clearRect(0,0,600,180);finish();onChange(false);}}>Hapus tanda tangan</button>
  </div>;
}
