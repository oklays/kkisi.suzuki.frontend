'use client';

import { useCallback, useRef, useState } from 'react';
import { floatingPosition, type FloatingPos } from './SidebarFloating';
import { useDismiss } from './use-dismiss';

/** A click-opened panel anchored to its trigger: Escape returns focus to the trigger, a press outside just closes. */
export function useAnchoredPanel(collapsed: boolean) {
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<FloatingPos | null>(null);
  const close = useCallback((via: 'escape' | 'outside') => { setPos(null); if (via === 'escape') trigger.current?.focus(); }, []);
  useDismiss(pos !== null, wrap, close);
  const toggle = () => {
    if (pos) setPos(null);
    else if (trigger.current) setPos(floatingPosition(trigger.current, collapsed ? 'side' : 'above'));
  };
  return { wrap, trigger, pos, toggle };
}
