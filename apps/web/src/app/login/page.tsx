import Image from "next/image";
import { LoginForm } from "./LoginForm";
import { consoleEnabled } from "@/infrastructure/console/flags";
import "./login.css";

export const metadata = { title: "Masuk · Koperasi Suzuki Mart" };
// The console flag is read per request so a runtime environment change takes effect without a rebuild.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-cover" aria-label="Tentang Koperasi Suzuki">
        <div className="login-cover-copy">
          <p className="login-cover-eyebrow">Koperasi Suzuki Mart</p>
          <h2>Selamat datang di Koperasi Suzuki.</h2>
          <p>Satu ruang kerja untuk operasional koperasi yang lebih cepat dan terhubung.</p>
        </div>
        <div className="login-cover-visual">
          <Image className="login-cover-art" src="/illustrations/login-illustration.png" width={1448} height={1086} priority alt="Ilustrasi kasir, stok barang, simpanan, dan pinjaman anggota Koperasi Suzuki" />
        </div>
      </section>
      <section className="login-panel" aria-label="Form masuk">
        <div className="login-panel-content">
          <Image className="login-brand" src="/illustrations/new-landscape-logo.jpeg" width={443} height={185} unoptimized preload alt="SMART KKISI Tambun 2" />
          {/* Without a valid `next`: console on -> /console decides (cashiers continue to /pos); console off -> /pos as before. */}
          <LoginForm fallback={consoleEnabled() ? "/console?entry=login" : "/pos"} />
        </div>
      </section>
    </main>
  );
}
