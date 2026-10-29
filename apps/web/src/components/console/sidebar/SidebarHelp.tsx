'use client';

import { SidebarFloating } from './SidebarFloating';
import { SidebarNavIcon } from './SidebarNavIcon';
import { useAnchoredPanel } from './use-anchored-panel';

/** Footer Help row: opens the same guidance the header Help shows (no link target exists for a help centre). */
export function SidebarHelp({ collapsed }: { collapsed: boolean }) {
  const { wrap, trigger, pos, toggle } = useAnchoredPanel(collapsed);
  return (
    <div ref={wrap} className="console-footer-item">
      <div className="console-nav-row" data-depth={0}>
        <button ref={trigger} type="button" className="console-nav-link" aria-haspopup="dialog" aria-expanded={pos !== null} onClick={toggle}>
          <SidebarNavIcon name="help" />
          <span className="console-nav-text">Bantuan</span>
        </button>
      </div>
      {pos && (
        <SidebarFloating pos={pos} className="console-menu" role="dialog" label="Bantuan konsol">
          <p className="console-menu-title">Bantuan Konsol Terpadu</p>
          <p className="console-menu-body">Gunakan pintasan <strong>Ctrl + K</strong> untuk berpindah antar modul Toko, KOSIPA, dan Warehouse sesuai izin akun Anda.</p>
        </SidebarFloating>
      )}
    </div>
  );
}
