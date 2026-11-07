'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Archive, CalendarDays, ChevronDown, ChevronRight, Coins, Database, FileText, Handshake, Info, Landmark, Layers, LayoutGrid, List, MapPin, Search, Settings, SlidersHorizontal, UsersRound, X, Percent, type LucideIcon } from 'lucide-react';
import type { MasterDirectoryEntry } from './master-data-catalog';
import styles from './master-data.module.css';

const GROUPS = [
  { id: 'reference', title: 'Data Referensi', description: 'Data dasar dan referensi umum yang digunakan di berbagai proses KOSIPA.', Icon: Layers },
  { id: 'product', title: 'Produk Keuangan', description: 'Data produk simpanan, pinjaman, pembiayaan, dan parameter terkait.', Icon: Coins },
] as const;

const ICONS: Partial<Record<MasterDirectoryEntry['id'], LucideIcon>> = {
  lokasi: MapPin, bagian: UsersRound, 'jenis-dokumen': FileText, 'rekening-bank': Landmark,
  'periode-angsuran': CalendarDays, 'jenis-simpanan': Database, 'jenis-pinjaman': Handshake,
  'jenis-pembiayaan': Layers, 'suku-bunga': Percent,
};

function ManagementMenu({ entries }: { entries: readonly MasterDirectoryEntry[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  return <div className={styles.management} ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); toggle.current?.focus(); }
  }}>
    <button ref={toggle} type="button" className={styles.manageButton} aria-expanded={open} aria-controls="master-management" onClick={() => setOpen(!open)}>
      <Settings size={18} aria-hidden="true" />Kelola<ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <nav id="master-management" className={styles.managementLinks} aria-label="Kelola master data" data-master-management>
      {entries.map((entry) => <Link key={entry.id} href={entry.href} prefetch={false} onClick={() => setOpen(false)}>{entry.title}<ChevronRight size={14} aria-hidden="true" /></Link>)}
    </nav>}
  </div>;
}

function MasterDataCard({ entry }: { entry: MasterDirectoryEntry }) {
  const Icon = ICONS[entry.id] ?? Layers;
  return <li>
    <Link href={entry.href} prefetch={false} className={styles.card} data-master-card={entry.id}>
      <span className={styles.cardIcon}><Icon size={25} strokeWidth={1.8} aria-hidden="true" /></span>
      <div className={styles.cardBody}><h3>{entry.title}</h3><p>{entry.description}</p></div>
      <span className={styles.open}>Buka<ChevronRight size={16} aria-hidden="true" /><span className="console-visually-hidden"> {entry.title}</span></span>
    </Link>
  </li>;
}

export function MasterDataDirectory({ entries, retired, canManage }: { entries: readonly MasterDirectoryEntry[]; retired: readonly string[]; canManage: boolean }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const searchInput = useRef<HTMLInputElement>(null);
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
  const search = normalize(query);
  const filtered = entries.filter((entry) => (group === 'all' || entry.group === group) && normalize(`${entry.title} ${entry.description}`).includes(search));
  const referenceCount = entries.filter((entry) => entry.group === 'reference').length;
  const productCount = entries.filter((entry) => entry.group === 'product').length;
  const summaries = [
    { title: 'Total Master', value: entries.length, subtitle: 'Seluruh master tersedia', Icon: Layers, tone: 'blue' },
    { title: 'Data Referensi', value: referenceCount, subtitle: 'Data dasar dan referensi', Icon: Database, tone: 'green' },
    { title: 'Produk Keuangan', value: productCount, subtitle: 'Produk dan parameter', Icon: Coins, tone: 'amber' },
    { title: 'Dipensiunkan', value: retired.length, subtitle: 'Menu lama · keputusan FD-33', Icon: Archive, tone: 'neutral' },
  ];
  const reset = () => { setQuery(''); setGroup('all'); searchInput.current?.focus(); };

  return <>
    <header className={styles.header}>
      <span className={styles.headerIcon}><Layers size={32} strokeWidth={1.8} aria-hidden="true" /></span>
      <div className={styles.heading}><h1>Master Data</h1><p>Data referensi KOSIPA yang dikelola secara terpusat dan digunakan di seluruh modul sistem.</p></div>
      {canManage && <ManagementMenu entries={entries} />}
    </header>

    <section className={styles.summary} aria-label="Ringkasan master data">
      {summaries.map(({ title, value, subtitle, Icon, tone }) => <div key={title} className={styles.summaryCard} data-tone={tone} data-master-summary={title} data-count={value}>
        <span className={styles.summaryIcon}><Icon size={25} strokeWidth={1.8} aria-hidden="true" /></span>
        <div><h2>{title}</h2><strong>{value}</strong><p>{subtitle}</p></div>
      </div>)}
    </section>

    <div className={styles.toolbar} role="search" aria-label="Pencarian master data">
      <div className={styles.searchField}>
        <label htmlFor="master-search" className="console-visually-hidden">Cari master data</label>
        <Search size={19} aria-hidden="true" />
        <input id="master-search" type="search" ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari master data (contoh: lokasi, pinjaman, bunga...)" autoComplete="off" />
        {query && <button type="button" aria-label="Hapus pencarian" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={17} aria-hidden="true" /></button>}
      </div>
      <div className={styles.groupField}>
        <label htmlFor="master-group" className="console-visually-hidden">Grup master data</label>
        <SlidersHorizontal size={17} aria-hidden="true" />
        <select id="master-group" value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="all">Semua Grup</option>
          {GROUPS.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </div>
      <div className={styles.viewSwitcher} role="group" aria-label="Tampilan master data">
        <button type="button" aria-label="Grid View" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={19} aria-hidden="true" /></button>
        <button type="button" aria-label="List View" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={20} aria-hidden="true" /></button>
      </div>
    </div>

    <p className="console-visually-hidden" role="status" aria-live="polite" aria-atomic="true">{filtered.length} dari {entries.length} master ditampilkan.</p>
    {filtered.length === 0 ? <section className={styles.empty} aria-labelledby="master-empty">
      <Search size={26} aria-hidden="true" /><h2 id="master-empty">Tidak ada master data yang sesuai dengan pencarian.</h2><button type="button" onClick={reset}>Reset Filter</button>
    </section> : GROUPS.map(({ id, title, description, Icon }) => {
      const items = filtered.filter((entry) => entry.group === id);
      if (!items.length) return null;
      return <section key={id} className={styles.section} aria-labelledby={`master-${id}`}>
        <div className={styles.sectionHeader}>
          <Icon size={25} strokeWidth={1.8} aria-hidden="true" /><h2 id={`master-${id}`}>{title}</h2><p>{description}</p><span className={styles.count}>{items.length} Master</span>
        </div>
        <ul className={styles.cards} data-view={view}>{items.map((entry) => <MasterDataCard key={entry.id} entry={entry} />)}</ul>
      </section>;
    })}

    <section className={`${styles.section} ${styles.retired}`} aria-labelledby="master-retired">
      <div className={styles.sectionHeader}>
        <Archive size={25} strokeWidth={1.8} aria-hidden="true" /><h2 id="master-retired">Master Dipensiunkan</h2><p>Data master yang sudah tidak digunakan (dipensiunkan) namun tetap disimpan untuk keperluan riwayat.</p><span className={styles.count}>{retired.length} Master</span>
      </div>
      <div className={styles.retiredInfo}>
        <Info size={20} aria-hidden="true" />
        {retired.length ? <div><p><strong>Menu lama yang dipensiunkan dari KOSIPA (FD-33)</strong></p><p>{retired.join(', ')}.</p><p>Tidak tersedia di aplikasi baru: tidak dipakai lagi oleh KOSIPA, atau tabelnya dikelola TOKO. Menu lamanya tetap dinonaktifkan.</p></div> : <p>Belum ada master yang dipensiunkan.</p>}
      </div>
    </section>
  </>;
}
