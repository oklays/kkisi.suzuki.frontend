import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { readerDb } from '../../../server/container.ts';
import { readFaqs, readFavorites, readNotices } from '../../../server/kosipa/content.reader.ts';

export const getFaqs = cache(async () => { await requireMember(); return attempt(() => readFaqs(readerDb())); });
export const getNotices = cache(async () => { await requireMember(); return attempt(() => readNotices(readerDb())); });
/** Wishlist of the session's own smartkkisi account (users.id from the session, never from the request). */
export const getFavorites = cache(async () => { const m = await requireMember(); return attempt(() => readFavorites(readerDb(), m.userId)); });
