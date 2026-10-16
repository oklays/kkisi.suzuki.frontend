/** Domain rule violation in the KOSIPA bounded context; `code` is stable and safe to return to clients. */
export class KosipaError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'KosipaError'; this.code = code; }
}
