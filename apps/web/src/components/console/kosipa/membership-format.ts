/** Initials from the first two words of a member name ("A. FAUZI NOFERI" -> "AF"); one word -> its first two letters. Pure and deterministic, no external image. */
export function initialsOf(name: string): string {
  const words = name.normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? [...words[0]].slice(0, 2).join('') : [...words[0]][0] + [...words[1]][0];
  return letters.toUpperCase();
}

/** Stable pastel variant 0..4 derived from the name (same member, same colour on every render). */
export function avatarTone(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return hash % 5;
}
