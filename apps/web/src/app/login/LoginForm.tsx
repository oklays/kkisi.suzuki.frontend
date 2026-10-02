"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { safeNextPath } from "@koperasi/domain/auth/redirect";

const MESSAGES: Record<number, string> = {
  401: "Username atau password salah.",
  429: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
  403: "Permintaan ditolak. Buka aplikasi dari alamat yang benar.",
  503: "Layanan masuk sedang tidak tersedia. Coba lagi nanti.",
};

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ username: String(form.get("username") ?? ""), password: String(form.get("password") ?? "") }),
      });
      if (response.ok) { window.location.assign(safeNextPath(new URLSearchParams(window.location.search).get("next"))); return; }
      setError(MESSAGES[response.status] ?? "Tidak dapat masuk. Coba lagi.");
    } catch { setError(MESSAGES[503]); }
    setBusy(false);
  }

  return (
    <form className="login-card" onSubmit={(event) => void submit(event)}>
      <header className="login-heading">
        <h1>Masuk ke Akun Anda</h1>
        <p>Silakan masuk dengan akun Anda untuk mengakses sistem Koperasi Suzuki.</p>
      </header>
      <label className="login-field">Username
        <span className="login-input-wrap"><UserRound size={19} aria-hidden="true" /><input name="username" autoComplete="username" placeholder="Masukkan username Anda" required maxLength={100} /></span>
      </label>
      <label className="login-field">Password
        <span className="login-input-wrap"><LockKeyhole size={19} aria-hidden="true" /><input name="password" type="password" autoComplete="current-password" placeholder="Masukkan password Anda" required maxLength={128} /></span>
      </label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}<ArrowRight size={19} aria-hidden="true" /></button>
    </form>
  );
}
