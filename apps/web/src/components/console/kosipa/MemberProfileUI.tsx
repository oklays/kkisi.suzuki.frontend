import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, Pencil } from 'lucide-react';
import { PageBreadcrumbs } from '../PageBreadcrumbs';
import type { TailCrumb } from '../breadcrumb-trail';
import { Provenance } from './KosipaUI';
import { MembershipStatusBadge } from './MembershipUI';
import { avatarTone, initialsOf } from './membership-format';

export const MEMBERS_PATH = '/console/kosipa/anggota';

/** A value that is absent is said to be absent, in muted text, instead of a bare dash. */
export function Value({ children }: { children: ReactNode }) {
  const empty = children === null || children === undefined || children === '' || children === false;
  return empty ? <span className="mprofile-empty">Tidak tercatat</span> : <>{children}</>;
}

export function MemberAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={large ? 'membership-avatar mprofile-avatar-lg' : 'membership-avatar'} data-tone={avatarTone(name)} aria-hidden="true">{initialsOf(name)}</span>;
}

/** Compact header for the register and edit pages: breadcrumb, title, one line of purpose. */
export function MemberFormHeader({ tail, title, children }: { tail?: readonly TailCrumb[]; title: string; children?: ReactNode }) {
  return <header className="mform-header">
    <PageBreadcrumbs tail={tail} />
    <h1 tabIndex={-1}>{title}</h1>
    {children && <p>{children}</p>}
  </header>;
}

/** Edit page: who is being edited, at a glance. */
export function MemberIdentityBar({ name, chips }: { name: string; chips: readonly { label: string; value: string | null }[] }) {
  return <div className="mprofile-identitybar">
    <MemberAvatar name={name} />
    <strong>{name || 'Anggota'}</strong>
    <dl>{chips.map((c) => <div key={c.label}><dt>{c.label}</dt><dd><Value>{c.value}</Value></dd></div>)}</dl>
  </div>;
}

export type Fact = { label: string; value: ReactNode };
type HeroProps = {
  name: string; nik: string; group: string | null; status: string | null; employment: string | null;
  facts: readonly Fact[]; readOnly: boolean;
  editHref: string | null; savingsHref: string | null;
};

/** The member card: identity on top, the facts that decide eligibility underneath. Anchor target of the "Profil" tab. */
export function MemberHero({ name, nik, group, status, employment, facts, readOnly, editHref, savingsHref }: HeroProps) {
  return <section className="mprofile-hero" id="sec-profil" aria-labelledby="mprofile-name">
    <div className="mprofile-hero-top">
      <MemberAvatar name={name} large />
      <div className="mprofile-hero-id">
        <h1 id="mprofile-name" tabIndex={-1}>{name || 'Anggota'}{readOnly && <Provenance kind="readonly" />}</h1>
        <ul className="mprofile-chips" aria-label="Ringkasan anggota">
          <li><span>NIK</span><b>{nik || 'Tidak tercatat'}</b></li>
          <li><span>Grup</span><b>{group ?? 'Tidak tercatat'}</b></li>
          <li><MembershipStatusBadge value={status} /></li>
          {employment?.trim() && <li><span>Karyawan</span><b>{employment.trim()}</b></li>}
        </ul>
      </div>
      <div className="mprofile-hero-actions">
        {editHref && <Link prefetch={false} className="kosipa-primary-action" href={editHref}><Pencil size={16} aria-hidden="true" />Ubah profil / status</Link>}
        {savingsHref && <Link prefetch={false} className="membership-view" href={savingsHref}><BookOpen size={16} aria-hidden="true" />Buku simpanan</Link>}
      </div>
    </div>
    <dl className="mprofile-facts">{facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd><Value>{f.value}</Value></dd></div>)}</dl>
  </section>;
}

/** Same section contract as before (restricted hides it, unavailable explains why); only the frame is compact. `action` sits next to the title. */
export function ProfileCard({ id, title, action, className, children }: { id: string; title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`mprofile-card${className ? ` ${className}` : ''}`} id={id} aria-labelledby={`${id}-title`}>
    <header><h2 id={`${id}-title`}>{title}</h2>{action}</header>
    {children}
  </section>;
}
