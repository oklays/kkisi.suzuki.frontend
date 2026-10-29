import type { ConsoleIcon } from '@/features/console/navigation';
import { CONSOLE_ICONS } from '../icons';

/** The one icon slot for every navigation level (module parents, entries, nested entries, flyout rows): fixed box, centred glyph, never shrinks. */
export function SidebarNavIcon({ name }: { name: ConsoleIcon }) {
  const Icon = CONSOLE_ICONS[name];
  return (
    <span className="console-nav-icon" aria-hidden="true">
      <Icon size={17} strokeWidth={1.9} />
    </span>
  );
}
