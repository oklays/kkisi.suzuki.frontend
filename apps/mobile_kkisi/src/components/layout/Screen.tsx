import type { CSSProperties, ReactNode } from 'react';
import { BottomNavigation } from '../navigation/BottomNavigation';

/** Mobile app frame of one screen: max 480 px column, optional bottom navigation or fixed action footer. */
export function Screen({ name, nav = false, footerSpace, className = '', children }: { name: string; nav?: boolean; footerSpace?: number; className?: string; children: ReactNode }) {
  const style = footerSpace ? ({ ['--footer-space' as string]: `${footerSpace}px` } as CSSProperties) : undefined;
  return (
    <div className={`app${nav ? ' has-nav' : ''}${footerSpace ? ' has-footer' : ''}${className ? ` ${className}` : ''}`} data-screen={name} style={style}>
      {children}
      {nav ? <BottomNavigation /> : null}
    </div>
  );
}
