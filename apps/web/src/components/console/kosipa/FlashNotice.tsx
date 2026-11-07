'use client';

import { useFlash } from './member-flash';

/** One place where the outcome of a row action is announced after the page refreshed (scope 'list'). */
export function FlashNotice() {
  const [message] = useFlash('list');
  return message ? <p className="console-message" role="status">{message.text}</p> : null;
}
