'use client';
import { useState, type FormEvent } from 'react';
import { useBrowserFact } from '@/hooks/browser-store';
import { Icon } from '@/components/ui/Icon';
import { SubmissionNotice } from '@/components/feedback/SubmissionNotice';
import { normaliseAccount, ppobService, type PpobService } from '../services/ppob';

type ContactsManager = { select: (props: string[], opts?: { multiple?: boolean }) => Promise<{ tel?: string[] }[]> };

export function PpobServiceForm({ serviceId }: { serviceId: PpobService['id'] }) {
  const service = ppobService(serviceId) as PpobService;
  const [account, setAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const [contactNote, setContactNote] = useState<string | null>(null);
  const phone = service.inputMode === 'tel';
  const contactsSupported = useBrowserFact(() => phone && 'contacts' in navigator && 'ContactsManager' in window);

  const pickContact = async () => {
    if (!contactsSupported) { setContactNote('Browser ini tidak mendukung pemilihan kontak. Ketik nomor tujuan langsung.'); return; }
    try {
      const [c] = await (navigator as Navigator & { contacts: ContactsManager }).contacts.select(['tel'], { multiple: false });
      const tel = c?.tel?.[0];
      if (tel) { setAccount(normaliseAccount(tel).replace(/^\+?62/, '0')); setError(null); }
    } catch { setContactNote('Pemilihan kontak dibatalkan.'); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = normaliseAccount(account);
    if (!value) { setError(`Isi ${service.accountLabel.toLowerCase()} terlebih dahulu.`); document.getElementById('service-account')?.focus(); return; }
    if (!service.pattern.test(value)) { setError(service.patternMessage); document.getElementById('service-account')?.focus(); return; }
    setError(null);
    setNotice(true);
  };

  return (
    <>
      <aside className="service-intro"><Icon name="info" /><p><strong>Layanan PPOB belum terhubung ke aplikasi.</strong> Kamu dapat memeriksa nomor tujuan, tetapi daftar {service.kind === 'bill' ? 'tagihan' : 'nominal'} dan harga belum dapat ditampilkan.</p></aside>
      <form id="service-form" noValidate onSubmit={submit}>
        <div className={phone ? 'phone-row' : undefined}>
          <label className="field" htmlFor="service-account"><span>{service.accountLabel}</span>
            <input id="service-account" type={phone ? 'tel' : 'text'} inputMode={phone ? 'tel' : 'numeric'} autoComplete={phone ? 'tel' : 'off'} maxLength={20} spellCheck={false} value={account}
              onChange={(e) => { setAccount(e.target.value); setError(null); }} aria-invalid={error ? true : undefined} aria-describedby="account-help account-error" />
            <small id="account-help">{service.accountHelp}</small>
            <span className="field-error" id="account-error" role="alert">{error}</span>
          </label>
          {phone ? <button className="secondary" type="button" onClick={pickContact}>Kontak</button> : null}
        </div>
        {contactNote ? <p className="field-help" role="status">{contactNote}</p> : null}
        <div className="service-overview">
          <div><span>{service.kind === 'bill' ? 'Tagihan' : 'Pilihan nominal'}</span><strong>Belum tersedia</strong><small>{service.title} · menunggu koneksi penyedia</small></div>
          <div className="service-symbol"><Icon name={service.symbol} /></div>
        </div>
        <div className="unavailable-panel">
          <h2>{service.kind === 'bill' ? 'Cek tagihan belum tersedia' : 'Daftar nominal belum tersedia'}</h2>
          <p>Harga, biaya admin dan {service.kind === 'bill' ? 'rincian tagihan' : 'produk'} berasal dari penyedia PPOB koperasi yang belum terhubung ke aplikasi anggota. Aplikasi tidak menampilkan harga perkiraan.</p>
        </div>
      </form>
      <footer className="form-footer stacked">
        <button className="primary" type="submit" form="service-form" style={{ marginTop: 0 }}>{service.kind === 'bill' ? 'Cek tagihan' : 'Lanjut ke Checkout'}</button>
        <p className="footer-caption">Tidak ada pembelian atau pembayaran yang diproses</p>
      </footer>
      <SubmissionNotice open={notice} onClose={() => setNotice(false)} title={service.title} channel={`Pembelian dan pembayaran ${service.title}`}
        rows={[['Layanan', service.title], [service.accountLabel, normaliseAccount(account)]]} />
    </>
  );
}
