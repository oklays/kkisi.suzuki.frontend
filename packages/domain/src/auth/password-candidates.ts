/**
 * The legacy app hashed `xss_clean(html_escape(password))` (Login_model / Users_model). html_escape is reproduced
 * exactly (32,789/32,789 identical to CodeIgniter 3.1.11 in the 2A-0 corpus); xss_clean is not reproducible for a
 * small class of passwords (see unsupportedPasswordClass), which therefore fail generically (decision S2-13).
 */
export function htmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** Candidates to try, cheapest and most likely first, without duplicates. */
export function passwordCandidates(password: string): string[] {
  const escaped = htmlEscape(password);
  return escaped === password ? [password] : [password, escaped];
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\t]/;
const PERCENT_HEX = /%[0-9a-fA-F]{2}/;
const NAUGHTY = /javascript|vbscript|expression|document\.|window\.|innerhtml|parentnode|-moz-binding|behavior|base64|(?:alert|eval|confirm|prompt|exec|system|passthru|fopen|file_get_contents|readfile|unlink)\s*\(/i;

/** Passwords legacy xss_clean would have rewritten in ways we cannot reproduce. Used only to label a failed login in the log. */
export function unsupportedPasswordClass(password: string): boolean {
  return PERCENT_HEX.test(password) || CONTROL.test(password) || NAUGHTY.test(password);
}

/** Only bcrypt hashes are accepted ($2a/$2b/$2x/$2y). Legacy md5 leftovers and anything else fail closed. */
export function isBcryptHash(hash: string): boolean {
  return /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash);
}

/** A syntactically valid cost-10 hash of a random value, used to spend equal CPU when no usable user exists. */
export const DUMMY_HASH = '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
