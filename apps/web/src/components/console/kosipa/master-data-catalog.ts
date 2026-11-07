import { MASTER_DEFINITIONS, MASTER_TYPES, type MasterType } from '@koperasi/domain/kosipa/master';
import { PRODUCT_MASTER_DEFINITIONS, PRODUCT_MASTER_TYPES, type ProductMasterType } from '@koperasi/domain/kosipa/product-master';
import { PRODUCT_PURPOSE } from './product-master-ui';

export type MasterDirectoryEntry = {
  id: MasterType | ProductMasterType;
  title: string;
  description: string;
  group: 'reference' | 'product';
  href: string;
};

const REFERENCE_PURPOSE: Record<MasterType, string> = {
  lokasi: 'Lokasi kerja yang dipilih pada data anggota.',
  bagian: 'Bagian (departemen) anggota; juga dibaca aplikasi anggota.',
  'jenis-dokumen': 'Daftar jenis dokumen pendukung.',
  'rekening-bank': 'Bank pembiaya untuk pinjaman bank; kode tersimpan di pinjaman.',
  'periode-angsuran': 'Pilihan jangka waktu angsuran dalam bulan.',
};

export const MASTER_DIRECTORY: readonly MasterDirectoryEntry[] = [
  ...MASTER_TYPES.map((id): MasterDirectoryEntry => ({
    id, title: MASTER_DEFINITIONS[id].title, description: REFERENCE_PURPOSE[id],
    group: 'reference', href: `/console/kosipa/master/${id}`,
  })),
  ...PRODUCT_MASTER_TYPES.map((id): MasterDirectoryEntry => ({
    id, title: PRODUCT_MASTER_DEFINITIONS[id].title, description: PRODUCT_PURPOSE[id],
    group: 'product', href: `/console/kosipa/master/${id}`,
  })),
];

// FD-33: retired KOSIPA menus, separate from the registered native masters. TOKO retains ownership of its db_* tables.
export const RETIRED_MASTERS = ['Divisi', 'Jabatan', 'Master Surat', 'Cabang', 'Daftar Pajak', 'Mata Uang', 'Kategori Beban', 'Jenis Pembayaran'] as const;
