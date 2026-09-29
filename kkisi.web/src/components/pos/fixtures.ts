import type { PosMember, PosProduct } from "@/application/pos/contracts";

// Illustrative catalog based on the approved mockup. No production IDs/data.
export const demoCategories = [
  { id: "demo-sembako", name: "Sembako" },
  { id: "demo-minuman", name: "Minuman" },
  { id: "demo-makanan", name: "Makanan" },
  { id: "demo-rumah", name: "Rumah Tangga" },
  { id: "demo-lainnya", name: "Lainnya" },
] as const;

function fixture(id: string, name: string, code: string, barcode: string, category: number, price: number, stock: number, low = false): PosProduct {
  const illustrations: Record<string, PosProduct["illustrationIndex"]> = {
    "demo-1": 1, "demo-2": 1, "demo-3": 2, "demo-4": 2, "demo-5": 2,
    "demo-6": 3, "demo-7": 1, "demo-8": 3, "demo-9": 3,
  };
  return {
    id, name, code, barcode, companyId: "demo-store",
    categoryId: demoCategories[category].id, categoryName: demoCategories[category].name,
    unitPriceRp: price, stock, imageUrl: null,
    illustrationIndex: illustrations[id],
    stockStatus: stock === 0 ? "empty" : low ? "low" : "available",
  };
}

export const demoProducts: PosProduct[] = [
  fixture("demo-1", "Air Mineral 600ml", "MIN-001", "DEMO899001", 1, 4000, 210),
  fixture("demo-2", "Mie Goreng Instan", "MAK-002", "DEMO899002", 2, 3500, 340),
  fixture("demo-3", "Kopi Sachet Renceng", "MIN-003", "DEMO899003", 1, 12000, 18, true),
  fixture("demo-4", "Nasi Ayam Geprek", "MAK-004", "DEMO899004", 2, 15000, 22),
  fixture("demo-5", "Gula Pasir 1kg", "SEM-001", "DEMO899005", 0, 16000, 0),
  fixture("demo-6", "Minyak Goreng 2L", "SEM-002", "DEMO899006", 0, 32000, 64),
  fixture("demo-7", "Sabun Cuci Piring", "RT-001", "DEMO899007", 3, 9500, 12, true),
  fixture("demo-8", "Roti Tawar", "MAK-005", "DEMO899008", 2, 14000, 40),
  fixture("demo-9", "Pulpen Biru", "LAIN-001", "DEMO899009", 4, 3000, 2, true),
];

export const demoMembers: PosMember[] = [{
  id: "demo-member", nik: "DEMO-12345", idCard: "DEMO-CARD-01", qrCode: "DEMO-QR-01",
  name: "Anggota Contoh", department: "Produksi · Data contoh", status: "AKTIVE",
}];
