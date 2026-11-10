import type { ReactNode } from 'react';
import { BackButton } from '../navigation/BackButton';
import { Icon, type IconName } from '../ui/Icon';

/** Secondary-screen header: back, title + subtitle, brand symbol (mockup "topbar" of every inner page). */
export function PageHeader({ title, subtitle, back, symbol, children }: { title: string; subtitle?: string; back: string; symbol: IconName; children?: ReactNode }) {
  return (
    <div className="app-header">
      <header className="topbar">
        <BackButton fallback={back} />
        <div className="header-copy">
          <h1 tabIndex={-1} id="page-title">{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="header-symbol" aria-hidden="true"><Icon name={symbol} /></span>
      </header>
      {children}
    </div>
  );
}
