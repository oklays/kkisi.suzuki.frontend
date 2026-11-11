// Stroke icons of the approved mockup (24x24, stroke 1.8). Paths are copied from the mockup; names describe the meaning.
const PATHS = {
  back: 'm15 5-7 7 7 7',
  chevronRight: 'm9 5 7 7-7 7',
  chevronDown: 'm7 10 5 5 5-5',
  store: 'M4 9h16v12H4ZM3 9l2-6h14l2 6M9 21v-7h6v7',
  package: 'm3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10M8 5l9 4v5',
  bell: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  eyeOff: 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  qr: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h3v3h-3ZM20 14h1v3M14 20h3M20 20h1v1',
  wallet: 'M4 7h16v13H4zM4 7l3-4h10M15 13h5',
  loan: 'M7 17 17 7M7 7h10v10',
  receipt: 'M6 4h12v17l-3-2-3 2-3-2-3 2ZM9 9h6M9 13h6',
  pie: 'M12 3v9h9M21 15a9 9 0 1 1-12-12',
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  heart: 'M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z',
  history: 'M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6',
  card: 'M3 7h16a2 2 0 0 1 2 2v11H3ZM3 7l3-4h12M16 13h5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  document: 'M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h4',
  info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  location: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  wifi: 'M5 8a11 11 0 0 1 14 0M8 12a6 6 0 0 1 8 0M11 16a2 2 0 0 1 2 0M12 20h.01',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  scan: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 12h8M12 8v8',
  address: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  lock: 'M5 11h14v10H5ZM8 11V7a4 4 0 1 1 8 0v4M12 15v2',
  ticket: 'M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6ZM14 7v2M14 12v2M14 17v1',
  chat: 'M21 11.5a8.5 8.5 0 0 1-13 7.2L3 20l1.3-5A8.5 8.5 0 1 1 21 11.5ZM8 8c0 4 2 6 6 6',
  help: 'M9 8a3 3 0 1 1 5 2c-1 1-2 1-2 3M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  settings: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  logout: 'M10 3H4v18h6M14 8l5 4-5 4M8 12h11',
  bolt: 'm13 2-9 12h7l-1 8 10-12h-7Z',
  calendar: 'M5 5h14v16H5ZM8 3v4m8-4v4M5 10h14',
  pen: 'm16 3 5 5-12 12H4v-5ZM14 5l5 5M3 23h18',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  calculator: 'M6 3h12v18H6ZM9 7h6M9 11h.01M15 11h.01M9 15h.01M15 15h.01M9 18h.01M15 18h.01',
  phone: 'M8 3h8v18H8ZM11 6h2M11 18h2',
  savings: 'M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10Z',
  arrowIn: 'M12 4v12m-5-5 5 5 5-5M5 20h14',
  arrowOut: 'M12 20V8m-5 5 5-5 5 5M5 4h14',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  shieldCheck: 'M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Zm-3 9 2 2 4-4',
  box: 'm3 7 9-4 9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10M7 5l9 4',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 5.2-2.7M19 12.6a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 11 5M12 20h.01',
  install: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v9h14v-9',
  plusSquare: 'M4 4h16v16H4ZM12 8v8M8 12h8',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} aria-label={title} focusable="false">
      {name === 'heart' && className?.includes('filled') ? <path d={PATHS[name]} fill="currentColor" /> : <path d={PATHS[name]} />}
    </svg>
  );
}

/** The search icon is a circle + line in the mockup. */
export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" />
    </svg>
  );
}
