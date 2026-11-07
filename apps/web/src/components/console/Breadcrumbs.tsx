import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export type BreadcrumbItem = {
  label: string;
  href?: string;
  icon?: LucideIcon;
  /** Icon-only crumb: the label stays as screen-reader text. Used for the root, which the header title already names. */
  iconOnly?: boolean;
  prefetch?: false;
};

/**
 * One breadcrumb for the whole console (header bar and page headers). The last item is the current page. Each crumb carries the icon
 * of its menu entry, so the trail reads at a glance; the icon is decoration and the label is always in the accessibility tree.
 */
export function Breadcrumbs({ items, className = '', prefetch }: { items: readonly BreadcrumbItem[]; className?: string; /** Default for every link; an item can override it. */ prefetch?: false }) {
  const last = items.length - 1;
  return (
    <nav aria-label="Breadcrumb" className={`console-breadcrumb ${className}`.trim()}>
      <ol>
        {items.map((item, i) => {
          const Icon = item.icon;
          const content = (
            <>
              {Icon && <Icon size={12} strokeWidth={2.2} aria-hidden="true" />}
              <span className={item.iconOnly ? 'console-visually-hidden' : undefined}>{item.label}</span>
            </>
          );
          return i === last || !item.href
            ? <li key={`${i}-${item.label}`} aria-current={i === last ? 'page' : undefined}><span className="crumb">{content}</span></li>
            : <li key={`${i}-${item.label}`}><Link className="crumb" href={item.href} prefetch={item.prefetch ?? prefetch} title={item.iconOnly ? item.label : undefined}>{content}</Link></li>;
        })}
      </ol>
    </nav>
  );
}
