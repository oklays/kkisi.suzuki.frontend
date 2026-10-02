import type { RegisterOpeningInput, RegisterOpeningResult } from '@koperasi/application/pos/register-lifecycle';
import type { AuthContext } from '@koperasi/application/auth/validate-session';
import { PosError } from '@koperasi/domain/pos/sale';
import { guard, json, readJson, type AuthServices } from '../../auth/http.ts';
import { registerRepository } from '../../repositories/prisma-register.repository.ts';
import { posErrorResponse } from '../http-errors.ts';

type Repository = { open(ctx: AuthContext, input: RegisterOpeningInput, now: Date): Promise<RegisterOpeningResult> };
export function parseRegisterOpening(value: unknown): RegisterOpeningInput {
  if (!value || typeof value !== 'object') throw new PosError('INVALID_INPUT');
  const { idKasir, saldoAwal } = value as Record<string, unknown>;
  if (!Number.isSafeInteger(idKasir) || Number(idKasir) <= 0 || Number(idKasir) > 2147483647) throw new PosError('INVALID_INPUT');
  if (!Number.isSafeInteger(saldoAwal) || Number(saldoAwal) < 0 || Number(saldoAwal) > 999999999) throw new PosError('INVALID_AMOUNT');
  return { idKasir: Number(idKasir), saldoAwal: Number(saldoAwal) };
}
export async function handleRegisterOpen(services: AuthServices, request: Request, repository: () => Repository = registerRepository): Promise<Response> {
  const g = await guard(services, request, { permission: 'sales_add', csrf: true });
  if (!g.ok) return g.response;
  try {
    const input = parseRegisterOpening(await readJson(request, 2000));
    return json(200, { register: await repository().open(g.ctx, input, services.deps.clock.now()) });
  } catch (error) { return posErrorResponse(services, error); }
}
