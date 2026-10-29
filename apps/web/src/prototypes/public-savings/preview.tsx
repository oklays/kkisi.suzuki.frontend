import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PublicSavingsPrototype } from './PublicSavingsPrototype.tsx';
import type { PrototypeScenario } from './types.ts';
import './prototype.css';

const scenarios: [PrototypeScenario,string][] = [
  ['verification','Verifikasi contoh'],['loading','Memuat'],['ready','Formulir'],
  ['submit-error','Pengiriman gagal lalu coba lagi'],['invalid','Tautan tidak valid'],
  ['expired','Tautan kedaluwarsa'],['revoked','Tautan dinonaktifkan'],
  ['consumed','Sudah digunakan'],['unavailable','Layanan tidak tersedia'],['success','Hasil simulasi'],
];
function Workbench() {
  const [scenario,setScenario] = useState<PrototypeScenario>('verification');
  return <><aside className="ps-workbench" aria-label="Kontrol pratinjau lokal"><label htmlFor="ps-scenario">Skenario simulasi</label><select id="ps-scenario" value={scenario} onChange={e=>setScenario(e.target.value as PrototypeScenario)}>{scenarios.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span>Fixture terisolasi · tidak terhubung ke layanan pengajuan</span></aside><PublicSavingsPrototype key={scenario} scenario={scenario}/></>;
}
createRoot(document.getElementById('prototype-root')!).render(<Workbench/>);
