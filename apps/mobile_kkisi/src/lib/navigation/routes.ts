import type { IconName } from '../../components/ui/Icon';

// Every navigable screen of the mockup has exactly one real URL here (deep-linkable, refresh-safe).
export const ROUTES = {
  masuk: '/masuk',
  pin: '/pin',
  beranda: '/beranda',
  simpanan: '/simpanan',
  pinjaman: '/pinjaman',
  ajukanPinjaman: '/pinjaman/ajukan',
  saldo: '/saldo',
  favorit: '/favorit',
  transaksi: '/transaksi',
  lainnya: '/lainnya',
  potongan: '/potongan',
  ajukanPotongan: '/potongan/ajukan',
  shu: '/shu',
  belanja: '/belanja',
  checkout: '/belanja/checkout',
  checkoutLayanan: '/layanan/checkout',
  layanan: (id: string) => `/layanan/${id}`,
} as const;

export type NavItem = { href: string; label: string; icon: IconName; owns: RegExp };
/** Bottom navigation (mockup order). Screens without their own tab (Simpanan, Pinjaman, ...) belong to Beranda, as in the mockup. */
export const NAV_ITEMS: NavItem[] = [
  { href: ROUTES.beranda, label: 'Beranda', icon: 'home', owns: /^\/(beranda|simpanan|pinjaman|potongan|shu|belanja|layanan)(\/|$)/ },
  { href: ROUTES.favorit, label: 'Favorit', icon: 'heart', owns: /^\/favorit(\/|$)/ },
  { href: ROUTES.transaksi, label: 'Transaksi', icon: 'history', owns: /^\/transaksi(\/|$)/ },
  { href: ROUTES.saldo, label: 'Saldo', icon: 'card', owns: /^\/saldo(\/|$)/ },
  { href: ROUTES.lainnya, label: 'Lainnya', icon: 'menu', owns: /^\/lainnya(\/|$)/ },
];

export const activeNav = (pathname: string): string => (NAV_ITEMS.find((i) => i.owns.test(pathname)) ?? NAV_ITEMS[0]).href;
