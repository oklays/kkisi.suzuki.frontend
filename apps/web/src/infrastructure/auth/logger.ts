import type { Logger } from '../../application/auth/ports.ts';

const SAFE = /^[A-Za-z0-9_.:-]{1,64}$/;

/** One line per event, only short allow-listed values: never a password, hash, session id, secret, URL or username. */
export function consoleLogger(): Logger {
  return (event, fields = {}) => {
    const parts = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === 'string' && !SAFE.test(v) ? '?' : String(v)}`);
    const alarm = event.startsWith('ALARM');
    (alarm ? console.error : console.warn)(`[auth]${alarm ? '[ALARM]' : ''} ${event}${parts.length ? ' ' + parts.join(' ') : ''}`);
  };
}
