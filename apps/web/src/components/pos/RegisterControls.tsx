"use client";
import { useRef, useState } from "react";
import type { PosSession } from "@/features/pos/types";
const messages: Record<string,string> = {
  REGISTER_STALE:"Tutup sesi lama di aplikasi kasir yang aktif.", REGISTER_AMBIGUOUS:"Tutup sesi kasir yang berlebih terlebih dahulu.",
  REGISTER_OPEN_OUTSIDE:"Tutup sesi kasir di cabang lain terlebih dahulu.", FORBIDDEN:"Kasir tidak tersedia atau akses ditolak.",
  REGISTER_RECAP_UNSUPPORTED:"Rekap sesi ini memerlukan pemeriksaan di aplikasi kasir yang aktif.",
};
export function RegisterControls({session,locked=false}: {session:PosSession;locked?:boolean}) {
  const [selected,setSelected]=useState(session.kasir?.[0]?.id ?? 0),[saldo,setSaldo]=useState("0"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [closing,setClosing]=useState<number|null>(null),[recap,setRecap]=useState<{saldoAwal:string;saldoAkhir:string;saldoKredit:string}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  async function post(action:"open"|"close",body:unknown) {
    if(locked||busy)return;
    setBusy(true);setMessage("");
    try {
      const response=await fetch(`/api/pos/register/${action}`,{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":session.csrfToken},body:JSON.stringify(body),cache:"no-store"});
      const result=await response.json();
      if(response.ok) { if(action==="open")window.location.reload();else setRecap(result.register);return; }
      setMessage(messages[result.error] ?? "Sesi kasir tidak dapat diperbarui. Coba lagi.");
    } catch {setMessage("Sesi kasir tidak dapat diperbarui. Coba lagi.");}
    finally {setBusy(false);}
  }
  if(!session.registerOpeningAvailable)return null;
  return <div className="pos-session pos-register-controls">
    {!session.register.open && !session.register.multiple && <>
      <label className="pos-branch-select">Kasir<select aria-label="Kasir" value={selected} disabled={busy||locked} onChange={e=>setSelected(Number(e.target.value))}>{session.kasir?.map(k=><option key={k.id} value={k.id}>{k.noKasir}</option>)}</select></label>
      <label className="pos-branch-select">Saldo awal<input className="pos-register-balance" aria-label="Saldo awal" type="number" min="0" max="999999999" step="1" value={saldo} disabled={busy||locked} onChange={e=>setSaldo(e.target.value)}/></label>
      <button className="pos-logout pos-register-open" disabled={busy||locked||!selected||!/^\d+$/.test(saldo)||Number(saldo)>999999999} onClick={()=>void post("open",{idKasir:selected,saldoAwal:Number(saldo)})}>Buka kasir</button>
    </>}
    {session.ownedRegisters?.map(r=><button key={r.id} className="pos-logout pos-register-close" disabled={busy||locked} onClick={()=>{setClosing(r.id);setMessage("");dialog.current?.showModal();}}>Tutup {r.noref}</button>)}
    <dialog ref={dialog} className="pos-clear-dialog" aria-labelledby="pos-register-title" onCancel={()=>setClosing(null)}>
      <h2 id="pos-register-title">{recap?"Rekap tutup kasir":"Konfirmasi tutup kasir"}</h2>
      {recap?<><p>Saldo awal Rp{recap.saldoAwal} · Saldo akhir Rp{recap.saldoAkhir} · Kredit Rp{recap.saldoKredit}</p><div><button onClick={()=>window.location.reload()}>Selesai</button></div></>:<><p>Tutup sesi kasir ini? Saldo akhir dan kredit dihitung dari transaksi tersimpan.</p><div><button disabled={busy} onClick={()=>{dialog.current?.close();setClosing(null);}}>Batal</button><button className="pos-confirm-clear pos-register-confirm" disabled={busy||locked||closing===null} onClick={()=>void post("close",{registerId:closing})}>Konfirmasi tutup kasir</button></div></>}
      {message&&<p role="status">{message}</p>}
    </dialog>
    {message && <span role="status" className="pos-session-message">{message}</span>}
  </div>;
}
