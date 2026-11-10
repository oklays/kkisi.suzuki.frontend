'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ServiceArt, type ServiceArtName } from '@/components/ui/ServiceArt';

// "Pilihan buat kamu": in-app shortcuts with the mockup's cards. They describe features of this app only — no offer, price or
// promotion is invented (koperasi promotions have no data source yet).
const SLIDES: { kicker: string; title: [string, string]; copy: string; cta: string; href: string; art: ServiceArtName; tone: string }[] = [
  { kicker: 'BELANJA DI S-MART', title: ['Kebutuhan harian,', 'dekat di koperasi.'], copy: 'Lihat katalog Toko S-MART TB2 untuk anggota.', cta: 'Buka katalog', href: '/belanja', art: 'belanja', tone: '' },
  { kicker: 'ISI ULANG & TAGIHAN', title: ['Pulsa sampai listrik,', 'ada di sini.'], copy: 'Temukan layanan untuk kebutuhan sehari-hari.', cta: 'Pilih layanan', href: '/layanan/pulsa', art: 'pulsa', tone: 'promo-blue' },
  { kicker: 'KABAR KOPERASI', title: ['Lebih dekat', 'dengan simpananmu.'], copy: 'Pantau simpanan wajib, sukarela, dan PBS.', cta: 'Lihat simpanan', href: '/simpanan', art: 'pascabayar', tone: 'promo-light' },
];

export function PromoCarousel() {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const go = (i: number) => {
    const t = track.current; if (!t) return;
    const idx = Math.max(0, Math.min(SLIDES.length - 1, i));
    const slide = t.children[idx] as HTMLElement;
    t.scrollTo({ left: slide.offsetLeft - (t.children[0] as HTMLElement).offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const sync = () => {
    const t = track.current; if (!t) return;
    const first = (t.children[0] as HTMLElement).offsetLeft;
    let best = 0;
    [...t.children].forEach((c, i) => { if (Math.abs((c as HTMLElement).offsetLeft - first - t.scrollLeft) < Math.abs((t.children[best] as HTMLElement).offsetLeft - first - t.scrollLeft)) best = i; });
    setCurrent(best);
  };
  return (
    <section className="promo-section" aria-labelledby="promo-title">
      <div className="section-heading"><div><h2 id="promo-title">Pilihan buat kamu</h2><p>Layanan S-MART &amp; koperasi.</p></div></div>
      <div className="promo-track" ref={track} role="region" aria-roledescription="carousel" aria-label="Pintasan layanan" tabIndex={0} onScroll={sync}
        onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(current + (e.key === 'ArrowRight' ? 1 : -1)); } }}>
        {SLIDES.map((s, i) => (
          <article key={s.href} className={`promo-card ${s.tone}`} role="group" aria-roledescription="slide" aria-label={`${i + 1} dari ${SLIDES.length}`}>
            <div className="promo-copy">
              <span className="promo-kicker">{s.kicker}</span>
              <h3>{s.title[0]}<br />{s.title[1]}</h3>
              <p>{s.copy}</p>
              <Link className="promo-cta" href={s.href} tabIndex={i === current ? 0 : -1}>{s.cta} <Icon name="chevronRight" /></Link>
            </div>
            <div className="promo-art" aria-hidden="true"><ServiceArt name={s.art} /></div>
          </article>
        ))}
      </div>
      <div className="carousel-controls">
        <div className="dots" role="group" aria-label="Pilih kartu">
          {SLIDES.map((_, i) => <button key={i} type="button" className="dot" aria-label={`Tampilkan kartu ${i + 1}`} aria-pressed={i === current} onClick={() => go(i)} />)}
        </div>
        <div className="arrows">
          <button type="button" className="carousel-arrow" aria-label="Kartu sebelumnya" disabled={current === 0} onClick={() => go(current - 1)}><Icon name="back" /></button>
          <button type="button" className="carousel-arrow" aria-label="Kartu berikutnya" disabled={current === SLIDES.length - 1} onClick={() => go(current + 1)}><Icon name="chevronRight" /></button>
        </div>
      </div>
    </section>
  );
}
