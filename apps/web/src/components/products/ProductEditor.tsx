"use client";

import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,Check,ClipboardList,Package,Save,X} from 'lucide-react';
import type {ProductAdjustmentInput,ProductEditSnapshot} from '@koperasi/domain/inventory';

const errors:Record<string,string>={INVALID_INPUT:'Periksa kolom wajib, format harga, dan jumlah stok. Beberapa karakter mungkin tidak didukung.',FORBIDDEN:'Akun Anda tidak memiliki izin mengedit produk.',STOCK_LOCKED:'Produk sedang stock opname. Selesaikan atau batalkan dokumen SO sebelum mengubah produk.',PRODUCT_CHANGED:'Produk atau stok berubah sejak form dibuka. Muat data terbaru dan periksa kembali perubahan Anda.',IDENTIFIER_EXISTS:'Kode barang, SKU, atau barcode tersebut sudah digunakan produk lain di cabang ini.',WRITE_NOT_CONFIGURED:'Penyimpanan produk belum diaktifkan. Hubungi pengelola.',NOT_FOUND:'Produk tidak ditemukan di cabang aktif.',PRODUCTS_UNAVAILABLE:'Produk belum dapat dimuat. Periksa koneksi dan coba lagi.'};
const quantity=(n:number)=>new Intl.NumberFormat('id-ID').format(n);

export function ProductEditor({id,csrfToken,writes,onClose,onSaved}:{id:number;csrfToken:string;writes:boolean;onClose:()=>void;onSaved:(message:string)=>void}){
 const router=useRouter(),dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);
 const [snapshot,setSnapshot]=useState<ProductEditSnapshot|null>(null),[tab,setTab]=useState<'data'|'stock'>('data');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [finalStock,setFinalStock]=useState(''),[reason,setReason]=useState<ProductAdjustmentInput['reason']>('Penyesuaian'),[confirm,setConfirm]=useState(false);
 const p=snapshot?.product,stock=snapshot?.stock??0;
 const validQuantity=/^\d+$/.test(finalStock)&&Number(finalStock)<=2147483647;
 const delta=validQuantity?Number(finalStock)-stock:0;
 const disabled=busy||loading||!!snapshot?.locked||!writes;
 const cannotSave=disabled||uncertain||conflict;

 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){
   try{
    const response=await fetch(`/api/products/edit?id=${id}`,{cache:'no-store',signal:controller.signal});
    if(response.status===401){router.replace('/login');return;}
    const data=await response.json();if(!response.ok)throw new Error(data.error);
    if(controller.signal.aborted)return;
    setSnapshot(data.snapshot);setFinalStock(String(data.snapshot.stock));setConfirm(false);setUncertain(false);setConflict(false);setError('');
   }catch(e){if(!controller.signal.aborted)setError(errors[e instanceof Error?e.message:'']??errors.PRODUCTS_UNAVAILABLE);}
   finally{if(!controller.signal.aborted)setLoading(false);}
  }
  void load();return()=>controller.abort();
 },[id,reload,router]);
 function refresh(){setLoading(true);setError('');setNotice('Data terbaru akan mengganti isian form. Periksa kembali sebelum menyimpan.');setReload(n=>n+1);}
 async function persist(action:'save'|'adjust',body:object){
  if(cannotSave||inFlight.current)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/api/products/edit',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},cache:'no-store',body:JSON.stringify({action,...body})});
   if(response.status===401){router.replace('/login');return;}
   const data=await response.json();
   if(!response.ok){
    if(response.status>=500&&data.error!=='WRITE_NOT_CONFIGURED')setUncertain(true);
    if(data.error==='PRODUCT_CHANGED')setConflict(true);
    if(data.error==='STOCK_LOCKED')setConflict(true);
    throw new Error(data.error);
   }
   onSaved(action==='save'?'Perubahan produk berhasil disimpan.':`Stok diperbarui menjadi ${quantity(data.stock)} (${data.delta>0?'+':''}${quantity(data.delta)}).`);
  }catch(e){
   const code=e instanceof Error?e.message:'';
   if(!errors[code]){setUncertain(true);setError('Hasil penyimpanan belum terkonfirmasi. Muat kondisi terbaru sebelum melakukan perubahan berikutnya.');}
   else setError(errors[code]);
  }finally{inFlight.current=false;setBusy(false);setConfirm(false);}
 }
 function saveData(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!p)return;
  const form=new FormData(event.currentTarget),get=(name:string)=>String(form.get(name)??''),association=(name:string)=>get(name)?Number(get(name)):null;
  void persist('save',{id:p.id,revision:p.revision,code:get('code'),sku:get('sku'),name:get('name'),barcode:get('barcode'),packBarcode:get('packBarcode'),description:get('description'),categoryId:association('categoryId'),brandId:association('brandId'),unitId:association('unitId'),packQuantity:Number(get('packQuantity')),sellingPrice:get('sellingPrice'),purchasePrice:get('purchasePrice'),discount:get('discount'),alertQty:Number(get('alertQty')),active:get('active')==='1'});
 }
 function close(){if(!inFlight.current)dialog.current?.close();}

 return <dialog ref={dialog} className="products-dialog products-editor" aria-labelledby="product-edit-title" onClose={onClose} onCancel={event=>{if(inFlight.current)event.preventDefault();}}>
  <div className="products-dialog-heading"><span className="products-item-icon"><Package size={25}/></span><div><span className="products-eyebrow">PENGELOLAAN PRODUK</span><h2 id="product-edit-title">Edit produk</h2><span className="products-code">{p?.name??'Memuat data terbaru…'}</span></div><button autoFocus type="button" className="products-detail-button" aria-label="Tutup edit produk" disabled={busy} onClick={close}><X size={20}/></button></div>
  <div className="product-editor-tabs" aria-label="Bagian edit produk"><button type="button" aria-pressed={tab==='data'} disabled={busy} onClick={()=>{setTab('data');setConfirm(false);}}><Package size={16}/>Data produk</button><button type="button" aria-pressed={tab==='stock'} disabled={busy} onClick={()=>setTab('stock')}><ClipboardList size={16}/>Penyesuaian stok</button></div>
  <div className="product-editor-notices">
   {notice&&<p className="product-editor-info" role="status">{notice}</p>}
   {(!writes||snapshot?.locked)&&<p className="product-editor-warning">{snapshot?.locked?errors.STOCK_LOCKED:errors.WRITE_NOT_CONFIGURED}</p>}
   {error&&<div className="product-editor-error" role="alert"><p>{error}</p>{(!snapshot||conflict||uncertain)&&<button type="button" className="products-button" disabled={busy||loading} onClick={refresh}>Muat kondisi terbaru</button>}</div>}
   {uncertain&&<p className="product-editor-warning">Simpan dinonaktifkan sementara agar permintaan yang belum terkonfirmasi tidak dikirim ulang.</p>}
  </div>
  {loading?<div className="product-editor-loading" role="status">Memuat data produk terbaru…</div>:p&&snapshot&&<>
   <form className="product-editor-form" onSubmit={saveData} hidden={tab!=='data'} key={p.revision}>
    <fieldset disabled={disabled||uncertain||conflict}>
     <section><h3>Identitas produk</h3><p>Kode untuk katalog dan barcode untuk pemindaian kasir.</p><div className="product-editor-grid">
      <label>Kode barang <span>*</span><input name="code" maxLength={100} required defaultValue={p.code}/></label><label>SKU<input name="sku" maxLength={100} defaultValue={p.sku} placeholder="SKU produk"/></label>
      <label className="product-editor-full">Nama barang <span>*</span><input name="name" maxLength={100} required defaultValue={p.name}/></label>
      <label>Barcode satuan<input name="barcode" maxLength={100} defaultValue={p.barcode}/></label><label>Barcode kemasan<input name="packBarcode" maxLength={100} defaultValue={p.packBarcode}/></label>
     </div></section>
     <section><h3>Kategori &amp; satuan</h3><div className="product-editor-grid">{[['categoryId','Kategori',snapshot.options.categories,p.categoryId],['brandId','Merek',snapshot.options.brands,p.brandId],['unitId','Satuan',snapshot.options.units,p.unitId]].map(([name,label,options,current])=>{
      const opts=options as ProductEditSnapshot['options']['units'],value=current as number|null;
      return <label key={String(name)}>{String(label)}<select name={String(name)} defaultValue={value??''}><option value="">{name==='brandId'?'Tanpa merek':'Belum diisi'}</option>{value!==null&&!opts.some(o=>o.id===value)&&<option value={value}>Data lama #{value}</option>}{opts.map(option=><option value={option.id} key={option.id}>{option.name}{option.active?'':' (nonaktif)'}</option>)}</select></label>;
     })}<label>Isi per kemasan<input name="packQuantity" type="number" min={1} max={2147483647} step={1} required defaultValue={p.packQuantity}/></label></div></section>
     <section><h3>Harga &amp; ketersediaan</h3><p>Harga dalam Rupiah. Gunakan titik untuk desimal, misalnya 4000.50.</p><div className="product-editor-grid">
      <label>Harga jual <span>*</span><div className="product-editor-money"><span>Rp</span><input name="sellingPrice" type="number" min={0} max="9999999999.99" step="0.01" required defaultValue={p.sellingPrice}/></div></label>
      <label>Harga beli <span>*</span><div className="product-editor-money"><span>Rp</span><input name="purchasePrice" type="number" min={0} max="9999999999.99" step="0.01" required defaultValue={p.purchasePrice}/></div></label>
      <label>Diskon per satuan<div className="product-editor-money"><span>Rp</span><input name="discount" type="number" min={0} max="9999999999.99" step="0.01" required defaultValue={p.discount}/></div></label>
      <label>Stok minimum<input name="alertQty" type="number" min={0} max={2147483647} step={1} required defaultValue={p.alertQty}/></label>
      <label>Status produk<select name="active" defaultValue={p.active?'1':'0'}><option value="1">Aktif</option><option value="0">Nonaktif</option></select></label>
      <label className="product-editor-full">Deskripsi<textarea name="description" rows={3} maxLength={5000} defaultValue={p.description}/></label>
     </div></section>
    </fieldset>
    <div className="products-dialog-footer"><p>Stok saat ini: <strong>{quantity(stock)}</strong>. Gunakan Penyesuaian stok untuk mengubahnya.</p><div className="product-editor-footer-actions"><button type="button" className="products-button" disabled={busy} onClick={close}>Batal</button><button type="submit" className="products-button products-primary" disabled={cannotSave}><Save size={15}/>{busy?'Menyimpan…':'Simpan perubahan'}</button></div></div>
   </form>
   <form className="product-editor-form product-editor-stock" hidden={tab!=='stock'} onSubmit={event=>{event.preventDefault();if(!cannotSave&&validQuantity&&delta&&snapshot.stockEditable)setConfirm(true);}}>
    <fieldset disabled={disabled||uncertain||conflict||!snapshot.stockEditable}>
     <section><h3>Penyesuaian stok</h3><p>Masukkan jumlah stok akhir yang benar. Selisihnya akan dicatat sebagai penyesuaian.</p>
      {!snapshot.stockEditable&&<p className="product-editor-warning">Stok produk PPOB dikelola melalui transaksi PPOB.</p>}
      <div className="product-stock-preview"><div><span>Stok saat ini</span><strong>{quantity(stock)}</strong></div><ArrowRight size={19}/><div><span>Stok akhir</span><strong>{validQuantity?quantity(Number(finalStock)):'—'}</strong></div><div className={`product-stock-delta ${delta<0?'product-stock-minus':''}`}><span>Selisih tercatat</span><strong>{validQuantity?`${delta>0?'+':''}${quantity(delta)}`:'—'}</strong></div></div>
      <div className="product-editor-grid"><label>Jumlah stok akhir <span>*</span><input name="quantity" type="number" min={0} max={2147483647} step={1} required value={finalStock} onChange={event=>{setFinalStock(event.target.value);setConfirm(false);}}/></label><label>Alasan penyesuaian <span>*</span><select name="reason" value={reason} onChange={event=>{setReason(event.target.value as ProductAdjustmentInput['reason']);setConfirm(false);}}><option value="Penyesuaian">Penyesuaian</option><option value="Rusak" disabled={delta>=0}>Rusak</option><option value="Expired" disabled={delta>=0}>Expired</option><option value="Hilang" disabled={delta>=0}>Hilang</option></select></label></div>
      {delta>0&&reason!=='Penyesuaian'&&<p className="product-editor-warning">Pilih alasan Penyesuaian untuk menambah stok.</p>}
      <p className="product-editor-stock-help">Stok akhir bisa nol. Perubahan ini berlaku untuk cabang aktif dan tidak mengubah stok cabang lain.</p>
     </section>
    </fieldset>
    {confirm&&<div className="product-stock-confirm" role="region" aria-label="Konfirmasi penyesuaian stok"><Check size={18}/><div><strong>Ubah stok dari {quantity(stock)} menjadi {quantity(Number(finalStock))}?</strong><p>Selisih {delta>0?'+':''}{quantity(delta)} · alasan {reason}</p></div></div>}
    <div className="products-dialog-footer"><p>Periksa hasil hitungan sebelum menyimpan.</p><div className="product-editor-footer-actions"><button type="button" className="products-button" disabled={busy} onClick={()=>confirm?setConfirm(false):close()}>{confirm?'Kembali':'Batal'}</button>{confirm?<button type="button" className="products-button products-primary" disabled={cannotSave} onClick={()=>void persist('adjust',{id:p.id,revision:p.revision,quantity:Number(finalStock),reason})}><Save size={15}/>{busy?'Menyimpan…':'Ya, simpan stok'}</button>:<button type="submit" className="products-button products-primary" disabled={cannotSave||!validQuantity||delta===0||!snapshot.stockEditable||(delta>0&&reason!=='Penyesuaian')}>Tinjau penyesuaian<ArrowRight size={15}/></button>}</div></div>
   </form>
  </>}
 </dialog>;
}
