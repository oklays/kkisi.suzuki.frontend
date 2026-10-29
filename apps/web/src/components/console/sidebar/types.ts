import type { NavSection } from '@koperasi/domain/console/navigation';
import type { ConsoleNavEntry } from '@/features/console/navigation';
import type { PosSession } from '@/features/pos/types';

export type ConsoleViewer = Pick<PosSession, 'userId' | 'userName' | 'branchName' | 'companyId' | 'canSwitchBranch' | 'companies' | 'csrfToken'>;
export type ConsoleNavGroup = { section: NavSection; label: string; items: ConsoleNavEntry[] };
export type SidebarTheme = 'light' | 'dark';

/** What every navigation row needs to know about the current page and the user's manual expand/collapse choices. */
export type NavContext = {
  currentId: string | null;
  /** Ids from the top level down to the current entry: these parents are open and highlighted. */
  trail: ReadonlySet<string>;
  toggled: Readonly<Record<string, boolean>>;
  onToggle: (id: string, open: boolean) => void;
};
