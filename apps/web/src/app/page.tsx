import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Koperasi Smart Suzuki",
  description: "Platform koperasi modern untuk mendukung operasional usaha dan layanan anggota secara lebih cepat, aman, dan terintegrasi.",
};

export default function Home() {
  return <LandingPage />;
}
