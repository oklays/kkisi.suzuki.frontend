/** DOMAIN SPIKE ports only; no provider implementation or submission use case. */
export interface PublicSavingsPolicySource {
  /** Future trusted application source; metadata still requires inspection and never grants authority. */
  read(policyVersion: string): unknown;
}

export interface PublicSavingsClock {
  nowEpochMs(): number;
}
