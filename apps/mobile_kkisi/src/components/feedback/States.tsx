import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '../ui/Icon';
import { RetryButton } from './RetryButton';

export function EmptyState({ icon = 'info', title, children, action, compact }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty${compact ? ' compact' : ''}`}>
      <span className="empty-icon" aria-hidden="true"><Icon name={icon} /></span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** A section that could not be read. It never shows a number in place of the missing data. */
export function UnavailableState({ what, compact = true }: { what: string; compact?: boolean }) {
  return (
    <div className={`empty error${compact ? ' compact' : ''}`} role="status">
      <span className="empty-icon" aria-hidden="true"><Icon name="info" /></span>
      <h3>{what} belum dapat dimuat</h3>
      <p>Data tidak ditampilkan agar tidak keliru. Periksa koneksi lalu coba lagi.</p>
      <RetryButton />
    </div>
  );
}

export function Note({ icon = 'info', title, children, tone }: { icon?: IconName; title?: string; children: ReactNode; tone?: 'warning' }) {
  return (
    <div className={`note${tone ? ` ${tone}` : ''}`}>
      <Icon name={icon} />
      <div>{title ? <strong>{title}</strong> : null}{children}</div>
    </div>
  );
}

export type Tone = 'success' | 'waiting' | 'muted' | 'danger';
export function StatusBadge({ tone, children, dot }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`status ${tone}${dot ? ' with-dot' : ''}`}>{children}</span>;
}

export function Skeleton({ height, width = '100%', onBlue, style }: { height: number; width?: number | string; onBlue?: boolean; style?: React.CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton${onBlue ? ' on-blue' : ''}`} style={{ display: 'block', height, width, ...style }} />;
}

export function SectionHeading({ id, title, subtitle, action }: { id?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div><h2 id={id}>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-link">{children}</Link>;
}
