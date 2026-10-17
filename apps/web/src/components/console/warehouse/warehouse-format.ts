export const SHIPMENT_STATUS: Record<string, string> = { DRAFT: 'Draf', SUBMITTED: 'Diajukan', APPROVED: 'Disetujui', DISPATCHED: 'Dikirim', CLOSED: 'Selesai', CANCELLED: 'Dibatalkan' };
export const OUTCOME: Record<string, string> = { NOT_RECEIVED: 'Belum diterima', PARTIALLY_RECEIVED: 'Diterima sebagian', FULLY_RECEIVED: 'Diterima penuh', RECEIVED_WITH_DISCREPANCY: 'Diterima dengan selisih' };
export const MAPPING_STATUS: Record<string, string> = { PROPOSED: 'Diusulkan (belum dipakai)', CONFIRMED: 'Dikonfirmasi', RETIRED: 'Dihentikan' };
export const TREATMENT: Record<string, string> = { UNSPECIFIED: 'Belum ditentukan (menunggu keputusan pemilik)', INTERNAL_TRANSFER: 'Transfer internal', COMMERCIAL_PURCHASE: 'Jual-beli' };
export const REJECTION: Record<string, string> = { DAMAGED: 'Rusak', REJECTED: 'Ditolak' };
export const RESOLUTION: Record<string, string> = { SHORT_CLOSED: 'Kekurangan ditutup', RETURNED_TO_SOURCE: 'Dikembalikan ke Gudang', WRITTEN_OFF: 'Dihapus' };
export const conversionText = (c: { kind: string; numerator?: number; denominator?: number }) => (c.kind === 'IDENTICAL' ? 'Satuan sama (1:1)' : `Rasio disetujui ${c.numerator}:${c.denominator}`);
export const BRANCH = (company: number) => `Cabang sintetis ${company}`;
