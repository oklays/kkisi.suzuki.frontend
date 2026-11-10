// Code-only errors that may reach the UI. Messages never carry SQL, hosts, credentials or member data.
export type ServiceErrorCode = 'NOT_CONFIGURED' | 'STORE_UNAVAILABLE' | 'READ_FAILED';

export class ServiceUnavailableError extends Error {
  readonly code: ServiceErrorCode;
  constructor(code: ServiceErrorCode) { super(code); this.code = code; this.name = 'ServiceUnavailableError'; }
}

/** A section that could not be read is shown as "belum dapat dimuat", never as zero. */
export type Loaded<T> = { state: 'ok'; data: T } | { state: 'unavailable'; reason: ServiceErrorCode };

export async function attempt<T>(read: () => Promise<T>): Promise<Loaded<T>> {
  try { return { state: 'ok', data: await read() }; } catch (e) {
    return { state: 'unavailable', reason: e instanceof ServiceUnavailableError ? e.code : 'READ_FAILED' };
  }
}
