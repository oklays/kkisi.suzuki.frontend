import type { PosMember } from "@/features/pos/types";

// Members are still illustrative (Stage 3 connects them). Products now come from the server.
export const demoMembers: PosMember[] = [{
  id: "demo-member", nik: "DEMO-12345", idCard: "DEMO-CARD-01", qrCode: "DEMO-QR-01",
  name: "Anggota Contoh", department: "Produksi · Data contoh", status: "AKTIVE",
}];
