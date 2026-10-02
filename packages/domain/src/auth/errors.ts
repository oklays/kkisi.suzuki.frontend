/** Safe, code-only errors. Messages never carry SQL, hosts, credentials or user data. */
export type AuthErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'CSRF' | 'BAD_REQUEST' | 'THROTTLED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly retryAfterSec: number | undefined;
  constructor(code: AuthErrorCode, retryAfterSec?: number) {
    super(code);
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

/** An auth/legacy store could not be used (connection lost, retries exhausted, pool cap). Always fail closed. */
export class StoreUnavailableError extends Error {
  constructor() { super('STORE_UNAVAILABLE'); }
}

/** The password worker queue is full: shed load instead of letting logins pile up. */
export class VerifierBusyError extends Error {
  constructor() { super('VERIFIER_BUSY'); }
}
