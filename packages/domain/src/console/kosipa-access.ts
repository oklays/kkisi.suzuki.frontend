import type { Capability, KosipaCapability } from './capabilities.ts';

/**
 * Upper bound of console KOSIPA access = the legacy controllers a KOSIPA account may open (ref_menu.url through
 * ref_menu_akses / ref_group_akses, exactly what legacy cekstatushakakses() checks). Legacy authorises per controller,
 * so only VIEW capabilities are derived here; write capabilities will need an explicit console policy (spec REQ-021).
 */
const MENU_CAPABILITIES: Readonly<Record<KosipaCapability, readonly string[]>> = {
  'kosipa.member.view': ['anggota/anggota_c', 'master/anggota_c'],
  'kosipa.savings.view': ['anggota/trans_simpanan_c', 'simpanan/simpanan_c', 'simpanan/kas_anggota_c'],
  'kosipa.loan.view': ['anggota/trans_pinjaman_c', 'pinjaman/pinjaman_c', 'pinjaman/kartu_aktif_c'],
  'kosipa.payroll.view': ['payroll/matrix_c'],
  'kosipa.store-credit.view': ['anggota/trans_toko_c'],
};

/** Menu URLs are compared case-insensitively and trimmed, like legacy `upper(a.url) = upper('<module>/<class>')`. */
export function kosipaCapabilitiesFromMenus(urls: readonly string[]): Set<Capability> {
  const allowed = new Set(urls.map((u) => u.trim().toLowerCase()));
  const out = new Set<Capability>();
  for (const [capability, menus] of Object.entries(MENU_CAPABILITIES) as [KosipaCapability, readonly string[]][]) {
    if (menus.some((m) => allowed.has(m))) out.add(capability);
  }
  // Member detail tabs are reachable only from the member directory.
  if (!out.has('kosipa.member.view')) return new Set();
  return out;
}

export const KOSIPA_MENU_URLS: readonly string[] = [...new Set(Object.values(MENU_CAPABILITIES).flat())];
