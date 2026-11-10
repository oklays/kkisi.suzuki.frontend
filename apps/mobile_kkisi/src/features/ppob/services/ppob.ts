import type { ServiceArtName } from '../../../components/ui/ServiceArt';
import type { IconName } from '../../../components/ui/Icon';

// Digital services ("Isi ulang dan bayar") of the mockup. PPOB products, prices and payments come from the IAK provider through
// the legacy system (docs/legacy-reference/07-integrations.md); no member-facing contract for them exists yet, so these screens
// collect and validate the customer number but never show invented prices and never submit a purchase.
export type PpobService = {
  id: 'pulsa' | 'token' | 'paket-data' | 'pascabayar' | 'pdam' | 'internet';
  label: string; title: string; subtitle: string; art: ServiceArtName; tone: 'blue' | 'orange'; symbol: IconName;
  accountLabel: string; accountHelp: string; inputMode: 'tel' | 'numeric'; pattern: RegExp; patternMessage: string;
  kind: 'prepaid' | 'bill';
};

export const PPOB_SERVICES: PpobService[] = [
  { id: 'token', label: 'Token', title: 'Token Listrik', subtitle: 'PPOB', art: 'token', tone: 'blue', symbol: 'bolt', accountLabel: 'ID Pelanggan / Nomor Meter',
    accountHelp: 'Nomor meter atau ID pelanggan PLN prabayar (11–12 digit).', inputMode: 'numeric', pattern: /^\d{11,12}$/, patternMessage: 'Nomor meter/ID pelanggan terdiri dari 11–12 digit angka.', kind: 'prepaid' },
  { id: 'pulsa', label: 'Pulsa', title: 'Pulsa', subtitle: 'PPOB', art: 'pulsa', tone: 'orange', symbol: 'phone', accountLabel: 'Nomor Tujuan',
    accountHelp: 'Nomor ponsel tujuan, diawali 08 atau 62.', inputMode: 'tel', pattern: /^(08\d{8,11}|628\d{8,11})$/, patternMessage: 'Nomor ponsel diawali 08 atau 62, 10–13 digit.', kind: 'prepaid' },
  { id: 'paket-data', label: 'Paket Data', title: 'Paket Data', subtitle: 'PPOB', art: 'paket', tone: 'blue', symbol: 'wifi', accountLabel: 'Nomor Tujuan',
    accountHelp: 'Nomor ponsel tujuan, diawali 08 atau 62.', inputMode: 'tel', pattern: /^(08\d{8,11}|628\d{8,11})$/, patternMessage: 'Nomor ponsel diawali 08 atau 62, 10–13 digit.', kind: 'prepaid' },
  { id: 'pascabayar', label: 'Pascabayar', title: 'Pascabayar', subtitle: 'PPOB · Tagihan', art: 'pascabayar', tone: 'orange', symbol: 'bolt', accountLabel: 'Nomor pelanggan',
    accountHelp: 'Nomor pelanggan listrik atau telepon pascabayar (8–15 digit).', inputMode: 'numeric', pattern: /^\d{8,15}$/, patternMessage: 'Nomor pelanggan harus berisi 8–15 digit angka.', kind: 'bill' },
  { id: 'pdam', label: 'Air PDAM', title: 'Air PDAM', subtitle: 'PPOB · Tagihan', art: 'pdam', tone: 'blue', symbol: 'document', accountLabel: 'Nomor pelanggan',
    accountHelp: 'Nomor pelanggan PDAM (6–15 digit).', inputMode: 'numeric', pattern: /^\d{6,15}$/, patternMessage: 'Nomor pelanggan harus berisi 6–15 digit angka.', kind: 'bill' },
  { id: 'internet', label: 'Internet', title: 'Internet', subtitle: 'PPOB · Tagihan', art: 'internet', tone: 'blue', symbol: 'wifi', accountLabel: 'Nomor pelanggan',
    accountHelp: 'Nomor pelanggan internet rumah (8–16 digit).', inputMode: 'numeric', pattern: /^\d{8,16}$/, patternMessage: 'Nomor pelanggan harus berisi 8–16 digit angka.', kind: 'bill' },
];

export const ppobService = (id: string) => PPOB_SERVICES.find((s) => s.id === id) ?? null;

/** Home grid order of the mockup: Token, Pulsa, Paket Data, Pascabayar, Belanja, Air PDAM, Internet, Lainnya. */
export const HOME_GRID: { label: string; href: string; art: ServiceArtName; tone: 'blue' | 'orange' }[] = [
  { label: 'Token', href: '/layanan/token', art: 'token', tone: 'blue' },
  { label: 'Pulsa', href: '/layanan/pulsa', art: 'pulsa', tone: 'orange' },
  { label: 'Paket Data', href: '/layanan/paket-data', art: 'paket', tone: 'blue' },
  { label: 'Pascabayar', href: '/layanan/pascabayar', art: 'pascabayar', tone: 'orange' },
  { label: 'Belanja', href: '/belanja', art: 'belanja', tone: 'blue' },
  { label: 'Air PDAM', href: '/layanan/pdam', art: 'pdam', tone: 'blue' },
  { label: 'Internet', href: '/layanan/internet', art: 'internet', tone: 'blue' },
];

/** Normalises a customer number typed with spaces/dashes ("0812-3456 7890" -> "081234567890", "+62..." -> "62..."). */
export const normaliseAccount = (raw: string) => raw.replace(/[\s-]/g, '').replace(/^\+/, '');
