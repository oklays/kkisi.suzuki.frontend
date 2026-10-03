"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus, RefreshCw, Search, Warehouse as WarehouseIcon, X } from "lucide-react";
import type { InventoryItem, StockOpname, StockOpnameDetail, StockOpnameCreate, Warehouse } from "@koperasi/domain/inventory";
import type { PosSession } from "@/features/pos/types";
import { PosShell } from "../pos/PosShell";
import { SessionControls } from "../pos/SessionControls";
import "../pos/pos.css";
import "./inventory.css";

type Capabilities = { stockOpname: boolean; warehouse: boolean; writes: boolean };
const messages: Record<string, string> = {
  INVALID_INPUT: "Periksa tanggal, jumlah fisik, dan kolom yang wajib diisi.",
  FORBIDDEN: "Akun Anda tidak memiliki izin untuk tindakan ini.", CSRF: "Muat ulang halaman untuk memperbarui sesi.",
  NOT_FOUND: "Dokumen atau produk tidak ditemukan. Muat ulang daftar.",
  STOCK_LOCKED: "Produk sedang dihitung dalam stock opname lain. Selesaikan dokumen tersebut terlebih dahulu.",
  STOCK_CHANGED: "Stok berubah sejak penghitungan dimulai. Batalkan draft dan hitung ulang produk.",
  DOCUMENT_IMMUTABLE: "Dokumen ini sudah disetujui atau berasal dari aplikasi lama dan tidak dapat diubah di sini.",
  EMPTY_DOCUMENT: "Simpan sedikitnya satu hitungan produk sebelum menyetujui dokumen.",
  NAME_EXISTS: "Nama warehouse sudah digunakan.", REQUEST_CONFLICT: "Permintaan draft sebelumnya memiliki data berbeda. Periksa daftar dokumen sebelum mencoba lagi.",
  WRITE_NOT_CONFIGURED: "Perubahan inventory belum diaktifkan. Hubungi pengelola.",
  INVENTORY_UNAVAILABLE: "Inventory belum dapat dimuat. Periksa koneksi dan coba lagi.",
};
const errorText = (error: unknown) => messages[error instanceof Error ? error.message : ""] ?? "Permintaan belum terkonfirmasi. Periksa daftar dan coba lagi.";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const quantity = (value: number) => new Intl.NumberFormat("id-ID").format(value);

type DocumentSelection = { id: number | null; detail: StockOpnameDetail | null; loading: boolean };
type DocumentSelectionAction = { type: "select"; id: number } | { type: "loaded"; detail: StockOpnameDetail } | { type: "failed" | "reset" };

export function inventoryDocumentSelection(state: DocumentSelection, action: DocumentSelectionAction): DocumentSelection {
  if (action.type === "select") return { id: action.id, detail: null, loading: true };
  if (action.type === "loaded") return action.detail.document.id === state.id ? { id: state.id, detail: action.detail, loading: false } : state;
  if (action.type === "failed") return { ...state, loading: false };
  return { id: null, detail: null, loading: false };
}

export function canEditInventoryDraft(document: StockOpname | undefined, username: string | undefined): boolean {
  return !!username && !!document?.managed && document.status === 0 && document.createdBy === username;
}

export function InventoryDraftFields({ date, attempt, disabled }: { date: string; attempt: StockOpnameCreate | null; disabled: boolean }) {
  return <fieldset disabled={disabled}>
    <label>Periode<input name="period" required maxLength={50} placeholder="Contoh: Opname Oktober 2026" defaultValue={attempt?.period ?? ""} /></label>
    <div className="inventory-field-pair"><label>Tanggal mulai<input type="date" name="startDate" defaultValue={attempt?.startDate ?? date} required /></label><label>Tanggal selesai<input type="date" name="endDate" defaultValue={attempt?.endDate ?? date} required /></label></div>
    <label>Catatan<textarea name="remarks" maxLength={1000} rows={3} defaultValue={attempt?.remarks ?? ""} /></label>
  </fieldset>;
}

export function InventoryScreen({ session, capabilities }: { session: PosSession; capabilities: Capabilities }) {
  const router = useRouter();
  const [tab, setTab] = useState<"stock" | "warehouse">(capabilities.stockOpname ? "stock" : "warehouse");
  const [documents, setDocuments] = useState<StockOpname[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selection, select] = useReducer(inventoryDocumentSelection, { id: null, detail: null, loading: false });
  const detail = selection.detail;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [newDraft, setNewDraft] = useState(false);
  const [draftUncertain, setDraftUncertain] = useState(false);
  const [warehouseEdit, setWarehouseEdit] = useState<Partial<Warehouse> | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [actualQty, setActualQty] = useState("");
  const [countNote, setCountNote] = useState("");
  const [confirmation, setConfirmation] = useState<"approve" | "cancel" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const tabButtons = useRef<Partial<Record<"stock" | "warehouse", HTMLButtonElement | null>>>({});
  const mutation = useRef(false);
  const selectionSequence = useRef(0);
  const [draftAttempt, setDraftAttempt] = useState<StockOpnameCreate | null>(null);
  const [date] = useState(today);
  const canEdit = capabilities.writes && !busy;
  const editable = canEditInventoryDraft(detail?.document, session.userLogin);

  async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/api/inventory/${path}`, {
      method: body ? "POST" : "GET", cache: "no-store", signal,
      ...(body ? { headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) { router.replace("/login"); throw new Error("FORBIDDEN"); }
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status });
    return data as T;
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        if (tab === "stock") setDocuments((await request<{ documents: StockOpname[] }>("stock-opnames", undefined, controller.signal)).documents);
        else setWarehouses((await request<{ warehouses: Warehouse[] }>("warehouses", undefined, controller.signal)).warehouses);
      } catch (failure) { if (!controller.signal.aborted) setError(errorText(failure)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
    // The session/CSRF capability is stable for this keyed page instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refresh]);

  useEffect(() => {
    if (!editable) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setSearchError("");
      try { setItems((await request<{ items: InventoryItem[] }>(`items?${new URLSearchParams({ q: query.trim() })}`, undefined, controller.signal)).items); }
      catch (failure) { if (!controller.signal.aborted) { setItems([]); setSearchError(errorText(failure)); } }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, query.trim() ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, editable, detail?.document.id, refresh]);

  async function selectDocument(id: number) {
    const sequence = ++selectionSequence.current;
    setError(""); select({ type: "select", id }); setSelectedItem(null); setNewDraft(false); setQuery("");
    try {
      const data = await request<{ detail: StockOpnameDetail }>(`stock-opnames?id=${id}`);
      if (selectionSequence.current === sequence) select({ type: "loaded", detail: data.detail });
    } catch (failure) { if (selectionSequence.current === sequence) { select({ type: "failed" }); setError(errorText(failure)); } }
  }

  async function mutate(action: () => Promise<void>) {
    if (mutation.current || !capabilities.writes) return;
    mutation.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); setRefresh(value => value + 1); }
    catch (failure) { setError(errorText(failure)); }
    finally { mutation.current = false; setBusy(false); }
  }

  function pickItem(item: InventoryItem) {
    const line = detail?.lines.find(value => value.itemId === item.id);
    setSelectedItem(item); setActualQty(line ? String(line.actualQty) : ""); setCountNote(line?.note ?? "");
  }

  function showConfirmation(action: "approve" | "cancel") { setConfirmation(action); dialog.current?.showModal(); }
  function changeTab(value: "stock" | "warehouse") {
    if (busy || value === tab) return;
    selectionSequence.current++; select({ type: "failed" }); setTab(value); setError(""); setNotice("");
  }

  function retryRead() {
    if (tab === "stock" && !newDraft && selection.id !== null) void selectDocument(selection.id);
    else setRefresh(value => value + 1);
  }
  function beginDraft() { selectionSequence.current++; setNewDraft(true); select({ type: "reset" }); setSelectedItem(null); setError(""); }

  return <PosShell session={session} branchName={session.branchName} active="inventory">
    <header className="pos-header inventory-header"><div><h1>Warehouse &amp; Stock Opname</h1><p>Lokasi gudang dan penghitungan fisik barang</p></div><SessionControls session={session} /></header>
    <main id="pos-workspace" className="inventory-content">
      <div className="inventory-toolbar"><div className="inventory-tabs" role="tablist" aria-label="Inventory" onKeyDown={event => {
        if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = (["stock", "warehouse"] as const).filter(value => value === "stock" ? capabilities.stockOpname : capabilities.warehouse);
        const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        changeTab(tabs[index]); tabButtons.current[tabs[index]]?.focus();
      }}>
        {capabilities.stockOpname && <button ref={element => { tabButtons.current.stock = element; }} role="tab" id="inventory-stock-tab" tabIndex={tab === "stock" ? 0 : -1} aria-controls="inventory-stock-panel" aria-selected={tab === "stock"} disabled={busy} onClick={() => changeTab("stock")}><ClipboardCheck size={18} />Stock Opname</button>}
        {capabilities.warehouse && <button ref={element => { tabButtons.current.warehouse = element; }} role="tab" id="inventory-warehouse-tab" tabIndex={tab === "warehouse" ? 0 : -1} aria-controls="inventory-warehouse-panel" aria-selected={tab === "warehouse"} disabled={busy} onClick={() => changeTab("warehouse")}><WarehouseIcon size={18} />Warehouse</button>}
      </div><button className="inventory-button" disabled={busy || loading || selection.loading} onClick={retryRead}><RefreshCw size={16} />Muat ulang</button></div>
      {!capabilities.writes && <p className="inventory-notice">Daftar dapat dilihat. Perubahan inventory belum diaktifkan; hubungi pengelola untuk membuka akses perubahan.</p>}
      {error && <div className="inventory-error" role="alert">{error}<button className="inventory-button" disabled={busy || selection.loading} onClick={retryRead}>Coba lagi</button></div>}
      {notice && <p className="inventory-notice" role="status">{notice}</p>}
      {draftUncertain && !(tab === "stock" && newDraft) && <p className="inventory-notice" role="status">Pembuatan draft sebelumnya belum terkonfirmasi. <button className="inventory-button" disabled={busy} onClick={() => { changeTab("stock"); beginDraft(); }}>Periksa draft sebelumnya</button></p>}
      {tab === "stock" ? <section role="tabpanel" id="inventory-stock-panel" tabIndex={0} aria-labelledby="inventory-stock-tab" className="inventory-stock-layout">
        <section className="inventory-card inventory-documents"><div className="inventory-section-title"><div><h2>Dokumen penghitungan</h2><p>{session.branchName} · 50 dokumen terakhir</p></div><button className="inventory-button primary" disabled={!canEdit} onClick={beginDraft}><Plus size={16} />{draftUncertain ? "Periksa draft sebelumnya" : "Buat draft"}</button></div>
          {loading ? <p className="inventory-empty" role="status">Memuat dokumen…</p> : documents.length === 0 ? <p className="inventory-empty">Belum ada stock opname. Buat draft untuk mulai menghitung barang.</p> : <ul className="inventory-document-list">{documents.map(document => <li key={document.id}><button disabled={busy} aria-pressed={selection.id === document.id && !newDraft} onClick={() => void selectDocument(document.id)}><span><strong>{document.period}</strong><small>{document.docNo}</small><small>{document.startDate ?? "—"} → {document.endDate ?? "—"}</small></span><span className={`inventory-badge ${document.status === 1 ? "approved" : ""}`}>{document.status === 1 ? "Disetujui" : "Draft"}</span></button></li>)}</ul>}
        </section>
        <section className="inventory-card inventory-detail">
          {newDraft ? <form className="inventory-form" onSubmit={event => {
            event.preventDefault(); if (mutation.current || !capabilities.writes) return; const data = new FormData(event.currentTarget);
            const attempt = draftAttempt ?? { requestKey: crypto.randomUUID(), period: String(data.get("period")), startDate: String(data.get("startDate")), endDate: String(data.get("endDate")), remarks: String(data.get("remarks")) };
            setDraftAttempt(attempt);
            void mutate(async () => {
              try {
                const result = await request<{ document: StockOpname }>("stock-opnames", { action: "create", ...attempt });
                setDraftAttempt(null); setDraftUncertain(false); setNewDraft(false); await selectDocument(result.document.id); setNotice("Draft dibuat. Pilih produk dan simpan jumlah fisik yang dihitung.");
              } catch (failure) {
                const status = (failure as { status?: number }).status;
                if (status && status < 500 && !draftUncertain) { setDraftAttempt(null); setDraftUncertain(false); }
                else setDraftUncertain(true);
                throw failure;
              }
            });
          }}><h2>Buat draft stock opname</h2><p>Produk terkunci untuk penjualan setelah hitungan pertama disimpan. Selesaikan atau batalkan draft untuk melepas kunci.</p>{draftUncertain && <p role="status">Hasil belum terkonfirmasi. Ulangi penyimpanan dengan data dan nomor permintaan yang sama.</p>}<InventoryDraftFields date={date} attempt={draftAttempt} disabled={!canEdit || draftUncertain} /><button className="inventory-button primary" type="submit" disabled={!canEdit}>{busy ? "Menyimpan…" : draftUncertain ? "Periksa / ulangi draft" : "Simpan draft"}</button></form> : selection.loading ? <p className="inventory-empty" role="status">Memuat detail dokumen…</p> : detail ? <>
            <div className="inventory-section-title"><div><h2>{detail.document.period}</h2><p className="inventory-document-number">{detail.document.docNo}</p><p>{detail.document.startDate ?? "—"} → {detail.document.endDate ?? "—"} · Dibuat oleh {detail.document.createdBy}</p></div><span className={`inventory-badge ${detail.document.status === 1 ? "approved" : ""}`}>{detail.document.status === 1 ? "Disetujui" : "Draft"}</span></div>
            {detail.document.remarks && <p className="inventory-remarks">{detail.document.remarks}</p>}
            {!detail.document.managed && <p className="inventory-notice">Dokumen dari aplikasi lama hanya dapat dilihat. Lanjutkan perubahannya di aplikasi yang membuat dokumen tersebut.</p>}
            {detail.document.managed && detail.document.status === 0 && !editable && <p className="inventory-notice">Draft ini dibuat oleh {detail.document.createdBy} dan hanya dapat diubah oleh pembuatnya.</p>}
            {editable && <div className="inventory-count-area"><label className="inventory-item-search"><Search size={17} /><input aria-label="Cari atau scan produk stock opname" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} placeholder="Scan barcode, nama, atau kode produk…" /></label>
              <div className="inventory-item-options" aria-busy={searching}>{searching ? <p>Memuat produk…</p> : searchError ? <p role="alert">{searchError}</p> : items.length === 0 ? <p>Produk tidak ditemukan. Coba nama atau barcode lain.</p> : items.map(item => { const included = detail.lines.some(line => line.itemId === item.id); return <button key={item.id} disabled={busy || (item.locked && !included)} aria-pressed={selectedItem?.id === item.id} onClick={() => pickItem(item)}><strong>{item.name}</strong><span>{item.barcode} · Stok {quantity(item.stock)}{item.locked ? " · Dalam penghitungan" : ""}</span></button>; })}</div>
              {selectedItem && <form className="inventory-count-form" onSubmit={event => { event.preventDefault(); void mutate(async () => {
                const result = await request<{ detail: StockOpnameDetail }>("stock-opnames", { action: "count", id: detail.document.id, itemId: selectedItem.id, actualQty: Number(actualQty), note: countNote });
                select({ type: "loaded", detail: result.detail }); setSelectedItem(null); setActualQty(""); setCountNote(""); setNotice("Hitungan fisik disimpan. Stok akan diperbarui saat dokumen disetujui.");
              }); }}><fieldset disabled={!canEdit}><div className="inventory-section-title"><strong>{selectedItem.name}</strong><button type="button" className="inventory-button" aria-label="Batal memilih produk" onClick={() => setSelectedItem(null)}><X size={16} /></button></div><div className="inventory-field-pair"><label>Jumlah fisik<input aria-label="Jumlah fisik" type="number" min={0} max={2147483647} step={1} required value={actualQty} onChange={event => setActualQty(event.target.value)} /></label><label>Catatan hitungan<input maxLength={1000} value={countNote} onChange={event => setCountNote(event.target.value)} /></label></div><button className="inventory-button primary" type="submit">{busy ? "Menyimpan…" : "Simpan hitungan"}</button></fieldset></form>}
            </div>}
            <div className="inventory-table-scroll"><table className="inventory-count-table"><caption>Hasil penghitungan · {detail.lines.length} produk</caption><thead><tr><th>Produk</th><th>Stok sistem</th><th>Fisik</th><th>Selisih</th>{editable && <th>Ubah</th>}</tr></thead><tbody>{detail.lines.map(line => <tr key={line.itemId}><td><strong>{line.name}</strong><small>{line.barcode}</small>{line.note && <small>{line.note}</small>}</td><td>{quantity(line.systemQty)}</td><td>{quantity(line.actualQty)}</td><td className={line.adjustmentQty < 0 ? "negative" : ""}>{line.adjustmentQty > 0 ? "+" : ""}{quantity(line.adjustmentQty)}</td>{editable && <td><button className="inventory-button" disabled={!canEdit} onClick={() => pickItem({ id: line.itemId, name: line.name, barcode: line.barcode, stock: line.systemQty, locked: true })}>Ubah</button></td>}</tr>)}</tbody></table></div>
            {detail.lines.length === 0 && <p className="inventory-empty">Belum ada hitungan tersimpan.{editable && " Pilih produk di atas, lalu masukkan jumlah fisiknya."}</p>}
            {editable && <div className="inventory-actions"><button className="inventory-button danger" disabled={!canEdit} onClick={() => showConfirmation("cancel")}>Batalkan draft</button><button className="inventory-button primary" disabled={!canEdit || detail.lines.length === 0} onClick={() => showConfirmation("approve")}>Setujui &amp; perbarui stok</button></div>}
          </> : selection.id !== null ? <div className="inventory-empty"><h2>Detail dokumen belum dimuat</h2><p>Gunakan Coba lagi atau Muat ulang untuk membaca dokumen yang dipilih.</p></div> : <div className="inventory-empty"><ClipboardCheck size={32} /><h2>Pilih dokumen penghitungan</h2><p>Lihat hitungan yang sudah tersimpan atau buat draft baru.</p></div>}
        </section>
      </section> : <section role="tabpanel" id="inventory-warehouse-panel" tabIndex={0} aria-labelledby="inventory-warehouse-tab" className="inventory-card">
        <div className="inventory-section-title"><div><h2>Warehouse</h2><p>Daftar lokasi gudang bersama untuk seluruh koperasi.</p></div><button className="inventory-button primary" disabled={!canEdit} onClick={() => setWarehouseEdit({ name: "", mobile: "", email: "", status: 1 })}><Plus size={16} />Tambah warehouse</button></div>
        {warehouseEdit && <form key={warehouseEdit.id ?? "new"} className="inventory-form inventory-warehouse-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (warehouseEdit.id && warehouseEdit.status === 1 && Number(data.get("status")) === 0 && !window.confirm("Nonaktifkan warehouse ini? Lokasi tetap tersimpan dalam daftar.")) return; void mutate(async () => {
          await request("warehouses", { ...(warehouseEdit.id ? { id: warehouseEdit.id } : {}), name: String(data.get("name")), mobile: String(data.get("mobile")), email: String(data.get("email")), status: Number(data.get("status")) });
          setWarehouseEdit(null); setNotice("Warehouse disimpan.");
        }); }}><h3>{warehouseEdit.id ? "Ubah warehouse" : "Tambah warehouse"}</h3><fieldset disabled={!canEdit}>
          <label>Nama warehouse<input name="name" required maxLength={100} defaultValue={warehouseEdit.name} /></label><div className="inventory-field-pair"><label>Nomor telepon<input name="mobile" maxLength={20} type="tel" defaultValue={warehouseEdit.mobile} /></label><label>Email<input name="email" maxLength={100} type="email" defaultValue={warehouseEdit.email} /></label></div><label>Status<select name="status" defaultValue={warehouseEdit.status}><option value={1}>Aktif</option><option value={0}>Nonaktif</option></select></label>
          <div className="inventory-actions"><button type="button" className="inventory-button" onClick={() => setWarehouseEdit(null)}>Batal</button><button className="inventory-button primary" type="submit">{busy ? "Menyimpan…" : "Simpan warehouse"}</button></div>
        </fieldset></form>}
        {loading ? <p className="inventory-empty" role="status">Memuat warehouse…</p> : warehouses.length === 0 ? <p className="inventory-empty">Belum ada warehouse. Tambahkan lokasi gudang pertama.</p> : <div className="inventory-table-scroll"><table className="inventory-count-table"><thead><tr><th>Warehouse</th><th>Kontak</th><th>Status</th><th>Ubah</th></tr></thead><tbody>{warehouses.map(warehouse => <tr key={warehouse.id}><td><strong>{warehouse.name}</strong></td><td>{warehouse.mobile || "—"}<small>{warehouse.email || "—"}</small></td><td><span className={`inventory-badge ${warehouse.status === 1 ? "approved" : ""}`}>{warehouse.status === 1 ? "Aktif" : "Nonaktif"}</span></td><td><button className="inventory-button" disabled={!canEdit} onClick={() => setWarehouseEdit(warehouse)}>Ubah</button></td></tr>)}</tbody></table></div>}
      </section>}
      <dialog ref={dialog} className="inventory-confirm" aria-labelledby="inventory-confirm-title" onClose={() => setConfirmation(null)}>
        <h2 id="inventory-confirm-title">{confirmation === "approve" ? "Setujui stock opname?" : "Batalkan draft?"}</h2><p>{confirmation === "approve" ? "Stok produk akan mengikuti jumlah fisik yang tersimpan. Dokumen yang sudah disetujui tidak dapat diubah." : "Hitungan draft akan dihapus dan kunci produk dilepas. Stok tidak akan berubah."}</p><div className="inventory-actions"><button className="inventory-button" autoFocus onClick={() => dialog.current?.close()}>Kembali</button><button className={`inventory-button ${confirmation === "approve" ? "primary" : "danger"}`} disabled={!canEdit} onClick={() => {
          if (!detail || !confirmation) return; const action = confirmation; const id = detail.document.id;
          dialog.current?.close(); void mutate(async () => {
            if (action === "approve") { select({ type: "loaded", detail: (await request<{ detail: StockOpnameDetail }>("stock-opnames", { action, id })).detail }); setNotice("Stock opname disetujui. Stok produk sudah diperbarui."); }
            else { await request("stock-opnames", { action, id }); select({ type: "reset" }); setSelectedItem(null); setNotice("Draft dibatalkan. Kunci produk sudah dilepas."); }
          });
        }}>{confirmation === "approve" ? "Ya, setujui" : "Ya, batalkan"}</button></div>
      </dialog>
    </main>
  </PosShell>;
}
