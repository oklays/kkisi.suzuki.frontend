import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { readerDb } from '../../../server/container.ts';
import { readShu } from '../../../server/kosipa/member.reader.ts';
import { buildShuYears } from './shu.ts';

export const getShuYears = cache(async () => {
  const m = await requireMember();
  return attempt(async () => buildShuYears(await readShu(readerDb(), m.nikKeys)));
});
