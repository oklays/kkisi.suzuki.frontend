import type { Metadata } from "next";
import { MemberComingSoon } from "@/components/landing/MemberComingSoon";

export const metadata: Metadata = {
  title: "Aplikasi Anggota · Koperasi Smart Suzuki",
  description: "Aplikasi Anggota Koperasi Smart Suzuki segera hadir.",
};

export default function MemberAppPage() {
  return <MemberComingSoon />;
}
