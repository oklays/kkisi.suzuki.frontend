import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { parseMasterId } from '@koperasi/domain/kosipa/master';
import { PRODUCT_MASTER_DEFINITIONS, type ProductMasterType } from '@koperasi/domain/kosipa/product-master';
import { listProductMaster } from '@koperasi/application/kosipa/commands/product-master';
import { PageBreadcrumbs } from '@/components/console/PageBreadcrumbs';
import { ContextNotice, FinancialTable } from '@/components/console/kosipa/KosipaUI';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { MemberFormHeader } from '@/components/console/kosipa/MemberProfileUI';
import { ProductMasterForm } from '@/components/console/kosipa/ProductMasterForm';
import { ProductMasterStatus } from '@/components/console/kosipa/ProductMasterStatus';
import { PRODUCT_LIST_COLUMNS } from '@/components/console/kosipa/product-master-ui';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { kosipaCommandServices } from '@/infrastructure/console/services';

/**
 * Server pages of the product masters (FA-03B T06), in the console standard of the member screens: PageBreadcrumbs with a tail, ContextNotice for
 * read-only states, FinancialTable for the list and the mform layout for create/edit. Every rule is enforced again by the API.
 */
const BASE = '/console/kosipa/master';
const short = (type: ProductMasterType) => PRODUCT_MASTER_DEFINITIONS[type].title.replace('Master ', '');
const number = (v: string) => (/^\d+(\.\d+)?$/.test(v) ? Number(v).toLocaleString('id-ID', { maximumFractionDigits: 4 }) : v || '—');

async function load(type: ProductMasterType, next: string) {
  const auth = await requireConsoleSession({ next });
  if (auth.kind !== 'ok') return { view: null as null };
  if (auth.kosipa !== 'linked' && auth.kosipa !== 'role') return { view: <KosipaNotice state={auth.kosipa} /> };
  if (!auth.capabilities.has('kosipa.member.view')) return { view: <KosipaNotice state="no-capability" /> };
  const services = kosipaCommandServices();
  if (!services) return { view: <KosipaNotice state="unavailable" /> };
  try {
    const data = await listProductMaster(services, { capabilities: auth.capabilities, kosipaUserId: auth.kosipaUserId }, type);
    return { data, csrfToken: auth.services.keys.csrfToken(auth.ctx.sidHash) };
  } catch { return { view: <KosipaNotice state="unavailable" /> }; }
}

function WriteNotices({ canManage, writable, legacy, title }: { canManage: boolean; writable: boolean; legacy: string; title: string }) {
  if (legacy === 'legacy-active') return <ContextNotice title="Menu KOSIPA lama masih aktif" tone="warning">Menu {title} di KOSIPA lama masih aktif, jadi halaman ini hanya menampilkan data. Perubahan dilakukan di KOSIPA sampai menu lama dinonaktifkan oleh operator.</ContextNotice>;
  if (!writable) return <ContextNotice title="Perubahan belum aktif">Perubahan master ini belum diaktifkan di lingkungan ini. Halaman ini hanya menampilkan data.</ContextNotice>;
  if (!canManage) return <ContextNotice title="Hanya lihat">Mengubah master data memerlukan hak <strong>Kelola master KOSIPA</strong> yang diberikan dua administrator.</ContextNotice>;
  return null;
}

export async function ProductMasterListPage({ type }: { type: ProductMasterType }) {
  const r = await load(type, `${BASE}/${type}`);
  if (!('data' in r) || !r.data) return r.view;
  const { definition: def, rows, facts, canManage, writable, legacy } = r.data;
  const canWrite = canManage && writable;
  const parents = new Map(facts.parents.map((p) => [String(p.id), p.code]));
  const show = (key: string, v: string) => {
    const f = def.fields.find((x) => x.key === key);
    if (f?.kind === 'flag') return v === '1' ? 'Ya' : 'Tidak';
    if (f?.kind === 'parent') return v === '0' ? 'Induk' : parents.get(v) ?? v;
    if (f?.kind === 'decimal' || f?.kind === 'int') return number(v);
    return v || '—';
  };
  const columns = PRODUCT_LIST_COLUMNS[type];
  return (
    <div className="console-page">
      <header className="kosipa-page-head">
        <PageBreadcrumbs tail={[{ label: short(type), icon: 'detail' }]} />
        <div className="kosipa-title-row"><h1 tabIndex={-1}>{def.title}</h1><span className="kosipa-provenance">KOSIPA: {def.legacyController}</span></div>
        <div className="kosipa-page-purpose"><p>Parameter produk dibaca transaksi dan laporan KOSIPA. Perubahan parameter keuangan memerlukan alasan dan tercatat di buku besar perintah.</p></div>
      </header>
      <WriteNotices canManage={canManage} writable={writable} legacy={legacy} title={short(type)} />
      {canWrite && <p className="product-actions"><Link prefetch={false} className="kosipa-primary-action" href={`${BASE}/${type}/baru`}><Plus size={18} aria-hidden="true" />Tambah {short(type).toLowerCase()}</Link></p>}
      <section className="console-section" aria-labelledby="product-list">
        <h2 id="product-list">Daftar <span className="kosipa-result-count">{rows.length} data</span></h2>
        {rows.length === 0 ? <p className="console-notice">Belum ada data.</p> : (
          <FinancialTable label={`Daftar ${def.title}`} columns={[...columns.map((c) => ({ key: c.key, label: c.label, numeric: c.numeric })), { key: 'status', label: 'Status' }, ...(canWrite ? [{ key: 'aksi', label: 'Aksi' }] : [])]}>
            <tbody>{rows.map((row) => (
              <tr key={row.id} data-product-id={row.id}>
                {columns.map((c) => <td key={c.key} className={c.numeric ? 'num' : undefined}>{show(c.key, row.values[c.key] ?? '')}</td>)}
                <td><span className="kosipa-provenance" data-kind={row.active ? undefined : 'unavailable'}>{row.active ? 'Aktif' : 'Tidak aktif'}</span></td>
                {canWrite && <td><Link prefetch={false} className="mform-link" href={`${BASE}/${type}/${row.id}/ubah`} aria-label={`Ubah ${row.values[def.codeKey] ?? row.id}`}><Pencil size={14} aria-hidden="true" />Ubah</Link></td>}
              </tr>
            ))}</tbody>
          </FinancialTable>
        )}
        <p className="console-notice">Data tidak dihapus permanen. {def.deactivateEffect}</p>
      </section>
    </div>
  );
}

export async function ProductMasterFormPage({ type, rawId }: { type: ProductMasterType; rawId?: string }) {
  let id: number | undefined;
  if (rawId !== undefined) { try { id = parseMasterId(rawId); } catch (e) { if (e instanceof KosipaError) notFound(); throw e; } }
  const r = await load(type, id === undefined ? `${BASE}/${type}/baru` : `${BASE}/${type}/${id}/ubah`);
  if (!('data' in r) || !r.data) return r.view;
  const { definition: def, rows, facts, canManage, writable, legacy } = r.data;
  if (!canManage) return <KosipaNotice state="no-capability" />;
  const row = id === undefined ? undefined : rows.find((x) => x.id === id);
  if (id !== undefined && !row) notFound();
  const label = row ? row.values[def.codeKey] || `#${row.id}` : 'Tambah';
  return (
    <div className="console-page mform-page">
      <MemberFormHeader title={row ? `Ubah ${short(type).toLowerCase()}` : `Tambah ${short(type).toLowerCase()}`}
        tail={[{ label: short(type), href: `${BASE}/${type}`, icon: 'detail' }, row ? { label, icon: 'edit' } : { label: 'Tambah', icon: 'add' }]}>
        {row ? `${row.values[def.codeKey]} · ${row.values[def.fields[1].key] ?? ''}` : `Baris baru di ${def.title}; langsung aktif setelah disimpan.`}
      </MemberFormHeader>
      <WriteNotices canManage={canManage} writable={writable} legacy={legacy} title={short(type)} />
      <ProductMasterForm key={row?.version ?? 'new'} definition={def} facts={facts} mode={row ? 'edit' : 'create'} row={row} csrfToken={r.csrfToken} canSubmit={canManage && writable} />
      {row && <ProductMasterStatus key={`s-${row.version}`} type={type} id={row.id} active={row.active} version={row.version} effect={def.deactivateEffect} csrfToken={r.csrfToken} canSubmit={canManage && writable} />}
    </div>
  );
}
