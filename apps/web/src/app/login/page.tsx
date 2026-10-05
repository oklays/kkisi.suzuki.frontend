import Image from "next/image";
import { LoginForm } from "./LoginForm";
import "./login.css";

export const metadata = { title: "Masuk · Koperasi Suzuki Mart" };

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
          <Image className="login-brand" src="/illustrations/kopkar-landscape-logo.png" width={1671} height={299} sizes="350px" preload alt="Koperasi Smart Suzuki" />
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
