"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import type { PosSession } from "@/application/pos/contracts";

async function post(path: string, csrfToken: string, body: unknown): Promise<Response> {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify(body), cache: "no-store" });
}

export function SessionControls({ session }: { session: PosSession }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function logout() {
    setBusy(true);
    try { await post("/api/auth/logout", session.csrfToken, {}); } finally { router.replace("/login"); router.refresh(); }
  }

  async function switchBranch(companyId: number) {
    if (companyId === session.companyId) return;
    setBusy(true); setMessage("");
    try {
      const response = await post("/api/auth/company", session.csrfToken, { companyId });
      if (response.ok) { window.location.reload(); return; }
      setMessage(response.status === 403 ? "Tutup sesi kasir yang terbuka di cabang lain lebih dulu." : "Cabang tidak dapat dipilih.");
    } catch { setMessage("Cabang tidak dapat dipilih."); }
    setBusy(false);
  }

  return (
    <div className="pos-session">
      {session.canSwitchBranch && (
        <label className="pos-branch-select">Cabang
          <select value={session.companyId} disabled={busy} onChange={(event) => void switchBranch(Number(event.target.value))}>
            {session.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
      )}
      <button className="pos-logout" type="button" disabled={busy} onClick={() => void logout()}><LogOut size={15} />Keluar</button>
      {message && <span className="pos-session-message" role="status">{message}</span>}
    </div>
  );
}
