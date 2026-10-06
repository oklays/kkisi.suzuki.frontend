import { PosError } from '@koperasi/domain/pos/sale';
import { errorResponse, json, type AuthServices } from '../auth/http.ts';

export function posErrorResponse(services: AuthServices, error: unknown): Response {
  if (error instanceof PosError) {
    const status = ['WRITE_NOT_CONFIGURED', 'QR_NOT_CONFIGURED'].includes(error.code) ? 503
      : error.code === 'FORBIDDEN' ? 403 : ['MEMBER_NOT_FOUND', 'SALE_NOT_FOUND', 'RETURN_NOT_FOUND'].includes(error.code) ? 404
      : ['INVALID_INPUT', 'INVALID_AMOUNT', 'INVALID_QR', 'RETURN_REASON_REQUIRED'].includes(error.code) ? 400 : 409;
    return json(status, { error: error.code });
  }
  // Prisma errors can contain SQL/DSNs/member data. Never send or log their message.
  if (error && typeof error === 'object' && ('code' in error || 'clientVersion' in error)) {
    services.deps.log('pos_database_unavailable');
    return json(503, { error: 'POS_UNAVAILABLE' });
  }
  return errorResponse(services, error);
}
