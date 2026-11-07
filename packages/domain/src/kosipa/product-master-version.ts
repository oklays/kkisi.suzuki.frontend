import { createHash } from 'node:crypto';

/**
 * Optimistic version of a product-master row (server only): SHA-256 of EVERY column the writer reads, as the database's own text, in a fixed
 * order (NULL distinct from ''). Product masters carry no personal data, so a plain digest suffices; any committed change by the native writer
 * or by a legacy screen changes it, and the second editor is refused as STALE. Separate file so client bundles never pull in node:crypto.
 */
export function productVersion(row: { id: number; columns: Readonly<Record<string, string | null>> }): string {
  const keys = Object.keys(row.columns).sort();
  return createHash('sha256').update(JSON.stringify([row.id, ...keys.map((k) => [k, row.columns[k] ?? null])])).digest('hex');
}
