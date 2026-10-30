/**
 * The legacy screens the FA-03A harness exercises (and discover-structure.mjs prepares the structure for): every read path of the five
 * native masters that exists in the KOSIPA source — the master screens themselves (index, DataTables list with search, edit fetch) and their
 * consumers (member form and its bagian AJAX, mobile-user detail screen and its bagian AJAX).
 */
export const MASTER_CONTROLLERS = ['lokasi_c', 'bagian_c', 'jenis_dokumen_c', 'rekening_bank_c', 'periode_angsuran_c'];
/** ref_menu ids of the synthetic seed (local-stack.mjs); legacy pages carry them as ?id_sub_menu= and post them back as `submenu`. */
export const MENU_ID = { lokasi_c: 9102, bagian_c: 9103, jenis_dokumen_c: 9104, rekening_bank_c: 9105, periode_angsuran_c: 9106 };

/** DataTables request exactly as the legacy JS sends it (server-side processing, the page's submenu id for the edit/delete buttons). */
export const dataTables = (controller, search = '') => ({ draw: '1', start: '0', length: '100', 'search[value]': search, 'search[regex]': 'false', submenu: String(MENU_ID[controller]) });

export const HARNESS_SCREENS = [
  ...MASTER_CONTROLLERS.flatMap((c) => [
    { path: `/master/${c}?id_menu=0&id_sub_menu=${MENU_ID[c]}` },
    { method: 'POST', path: `/master/${c}/ajax_list`, form: dataTables(c) },
    { method: 'POST', path: `/master/${c}/ajax_edit/1` },
  ]),
  { path: '/anggota/anggota_c?id_menu=0&id_sub_menu=9108' },
  { method: 'POST', path: '/anggota/anggota_c/ajax_list', form: { draw: '1', start: '0', length: '50', 'search[value]': '', id_menu: '9108' } },
  { method: 'POST', path: '/anggota/anggota_c/get_bagian' },
  { path: '/mobile/users_c/detail_user/9101/SKFA0001' },
  { method: 'POST', path: '/mobile/users_c/get_bagian' },
];
