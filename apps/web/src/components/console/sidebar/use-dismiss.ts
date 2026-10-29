'use client';

import { useEffect, type RefObject } from 'react';

/** While `active`: Escape or a press outside `container` calls `onDismiss` (Escape tells the caller so focus can go back to the trigger). */
export function useDismiss(active: boolean, container: RefObject<HTMLElement | null>, onDismiss: (via: 'escape' | 'outside') => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss('escape'); };
    const onPress = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) onDismiss('outside'); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPress); };
  }, [active, container, onDismiss]);
}
