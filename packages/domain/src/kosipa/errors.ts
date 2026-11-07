/** Domain rule violation in the KOSIPA bounded context; `code` is stable and safe to return to clients. */
export class KosipaError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'KosipaError'; this.code = code; }
}

/** A rule violation tied to one input field. `field` is a column/field NAME (never a value), so it is as safe to return as the code. */
export class KosipaFieldError extends KosipaError {
  readonly field: string;
  constructor(code: string, field: string) { super(code); this.name = 'KosipaFieldError'; this.field = field; }
}
