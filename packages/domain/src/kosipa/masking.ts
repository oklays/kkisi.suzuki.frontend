/** Display masking for member contact/bank data (spec SEC-006). Unmasked access needs a separate, audited capability. */
export function maskPhone(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 6) return digits ? '•'.repeat(digits.length) : null;
  return `${digits.slice(0, 4)}${'•'.repeat(digits.length - 7)}${digits.slice(-3)}`;
}
export function maskEmail(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  const at = v.indexOf('@');
  if (at < 1) return v ? '•••' : null;
  return `${v[0]}•••@${v.slice(at + 1)}`;
}
export function maskAccount(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/\s/g, '');
  if (!v) return null;
  return v.length <= 4 ? '••••' : `••••${v.slice(-4)}`;
}
