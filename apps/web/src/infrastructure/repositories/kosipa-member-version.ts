import { createHmac } from 'node:crypto';
import { MEMBER_FIELD_CLASSES } from '@koperasi/domain/kosipa/member-command';

/**
 * Member optimistic version (T04 decision). 64 lowercase hex = HMAC-SHA256(server secret, canonical JSON of EVERY m_anggota column the writer can
 * read, in the fixed order below). The credential column `password` is not read by the application at all. All values are the database's own
 * text rendering (CAST ... AS CHAR; dates 'YYYY-MM-DD', timestamps 'YYYY-MM-DD HH:MM:SS', NULL kept distinct from ''), so ANY committed change
 * to the row — by this application or by any legacy writer, including `ud` — changes the version and the second editor is refused as STALE.
 * The version is opaque: the client only echoes it back.
 */
export const MEMBER_VERSION_COLUMNS: readonly string[] = Object.values(MEMBER_FIELD_CLASSES).flat().filter((column) => column !== 'password');

export type MemberRowText = Readonly<Record<string, string | null>>;

export function memberVersion(secret: string, row: MemberRowText): string {
  const canonical = JSON.stringify(MEMBER_VERSION_COLUMNS.map((column) => [column, row[column] ?? null]));
  return createHmac('sha256', secret).update(canonical).digest('hex');
}
