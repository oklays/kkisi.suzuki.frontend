import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "KKISI TB2 | Koperasi Karyawan PT Indomobil Suzuki International",
  description: "Platform digital KKISI TB2 untuk mendukung pengelolaan koperasi, operasional usaha, dan layanan anggota secara modern, aman, dan terintegrasi.",
};

export default function Home() {
  return <LandingPage />;
}
