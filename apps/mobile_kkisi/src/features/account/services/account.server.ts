import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { readerDb } from '../../../server/container.ts';
import { readFavorites } from '../../../server/kosipa/content.reader.ts';
import { cachedFaqs, cachedNotices } from '../../../server/cache/cached-reads.ts';

export const getFaqs = cache(async () => { await requireMember(); return attempt(() => cachedFaqs(readerDb())); });
export const getNotices = cache(async () => { await requireMember(); return attempt(() => cachedNotices(readerDb())); });
/** Wishlist of the session's own smartkkisi account (users.id from the session, never from the request). */
export const getFavorites = cache(async () => { const m = await requireMember(); return attempt(() => readFavorites(readerDb(), m.userId)); });
