import type { PosRepository } from '@koperasi/application/pos/checkout';
import { PosError } from '@koperasi/domain/pos/sale';
import { guard, json, type AuthServices } from '../../auth/http.ts';
import { PrismaPosRepository } from '../../repositories/prisma-pos.repository.ts';
import { decodeMemberIdentifier } from '../member-qr.ts';
import { posErrorResponse } from '../http-errors.ts';

export async function handleMembers(services: AuthServices, request: Request, repo: Pick<PosRepository, 'member'> = new PrismaPosRepository()): Promise<Response> {
  const g = await guard(services, request, { permission: 'sales_add' });
  if (!g.ok) return g.response;
  try {
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind') ?? 'identifier';
    if (kind !== 'identifier' && kind !== 'qr') throw new PosError('INVALID_INPUT');
    const identifier = decodeMemberIdentifier(params.get('identifier') ?? '', kind);
    return json(200, { member: await repo.member(g.ctx, identifier, services.deps.clock.now()) });
  } catch (error) { return posErrorResponse(services, error); }
}
