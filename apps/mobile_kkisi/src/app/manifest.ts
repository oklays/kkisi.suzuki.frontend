import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'S-MART KKISI TB2 — Anggota',
    short_name: 'S-MART TB2',
    description: 'Aplikasi anggota Koperasi Karyawan KKISI Tambun 2: simpanan, pinjaman, potongan, SHU, kredit toko dan belanja.',
    lang: 'id-ID',
    dir: 'ltr',
    start_url: '/beranda?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#FFFFFF',
    categories: ['finance', 'shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Simpanan', url: '/simpanan', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Pinjaman', url: '/pinjaman', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Belanja', url: '/belanja', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
