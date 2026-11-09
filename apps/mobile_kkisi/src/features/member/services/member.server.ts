import 'server-only';
import { cache } from 'react';
import { maskEmail, maskPhone } from '@koperasi/domain/kosipa';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { ServiceUnavailableError } from '../../../lib/errors/service-errors.ts';
import { readerDb } from '../../../server/container.ts';
import { readProfile } from '../../../server/kosipa/member.reader.ts';
import { titleCase } from '../../../lib/utils/dates.ts';

/** The member's own m_anggota row (by session member id AND NIK keys). Memoised per request. */
export const getProfileRow = cache(async () => {
  const m = await requireMember();
  const row = await readProfile(readerDb(), m.memberId, m.nikKeys);
  if (!row) throw new ServiceUnavailableError('READ_FAILED');
  return row;
});

export type ProfileView = { name: string; firstName: string; nik: string; group: string | null; status: string | null; section: string | null; location: string | null; division: string | null; phone: string | null; email: string | null; address: string | null; joinedOn: string | null };
export const getProfile = cache(async (): Promise<ProfileView> => {
  const p = await getProfileRow();
  const name = titleCase(p.name) || 'Anggota';
  return { name, firstName: name.split(' ')[0], nik: p.nik, group: p.group, status: p.status, section: p.section ? titleCase(p.section) : null, location: p.location ? titleCase(p.location) : null,
    division: p.division ? titleCase(p.division) : null, phone: maskPhone(p.phone), email: maskEmail(p.email), address: p.address ? titleCase(p.address) : null, joinedOn: p.joinedOn };
});
