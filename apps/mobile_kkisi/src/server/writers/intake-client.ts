import { INTAKE_HEADER, signIntakeRequest, type IntakeKey } from '@koperasi/application/member-intake/signature';

// Loan applications and deduction changes are written by apps/web (P1): its KOSIPA command pipeline owns trans_*_pengajuan, the
// idempotency ledger and the audit. This client signs the request (shared HMAC contract) and maps apps/web's codes to the PWA's.
// Anything unexpected (network, timeout, 5xx, signature or routing refusal) is "service unavailable"; the member retries with the
// same Idempotency-Key and apps/web replays the first result, so a retry never creates a second request.

export const INTAKE_PATH = '/api/internal/member-requests';

export type IntakeMember = { memberId: number; userId: number; nik: string };
export type IntakeBody =
  | { kind: 'loan'; clientKey: string; member: IntakeMember; productId: number; amountRp: number; months: number; purpose: string }
  | { kind: 'deduction'; clientKey: string; member: IntakeMember; savingsType: string; requestedRp: number };

export type IntakeReply =
  | { ok: true; status: 200 | 201; replayed: boolean; docNo: string; summary: Record<string, string | number> }
  | { ok: false; kind: 'refused'; status: number; code: string; field?: string }
  | { ok: false; kind: 'unavailable' };

export interface MemberIntakeSubmitter { submit(body: IntakeBody): Promise<IntakeReply> }

export type IntakeSettings = { baseUrl: string; keys: readonly IntakeKey[]; timeoutMs?: number };

type Fetch = typeof fetch;

export class HttpMemberIntakeClient implements MemberIntakeSubmitter {
  private readonly settings: IntakeSettings;
  private readonly fetchImpl: Fetch;
  constructor(settings: IntakeSettings, fetchImpl: Fetch = fetch) { this.settings = settings; this.fetchImpl = fetchImpl; }

  async submit(body: IntakeBody): Promise<IntakeReply> {
    const text = JSON.stringify(body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs ?? 10_000);
    try {
      const res = await this.fetchImpl(new URL(INTAKE_PATH, this.settings.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', [INTAKE_HEADER]: signIntakeRequest(this.settings.keys, { method: 'POST', path: INTAKE_PATH, body: text }) },
        body: text,
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if ((res.status === 200 || res.status === 201) && json?.ok === true && typeof json.docNo === 'string') {
        const summary = json.summary && typeof json.summary === 'object' ? json.summary as Record<string, string | number> : {};
        return { ok: true, status: res.status, replayed: json.replayed === true, docNo: json.docNo, summary };
      }
      // Business refusals only (4xx with a code); 401/404/413/415 mean the channel itself is misconfigured -> unavailable.
      if (json && typeof json.error === 'string' && [400, 409, 422].includes(res.status)) {
        return { ok: false, kind: 'refused', status: res.status, code: json.error, ...(typeof json.field === 'string' ? { field: json.field } : {}) };
      }
      return { ok: false, kind: 'unavailable' };
    } catch {
      return { ok: false, kind: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }
}
