"use client";

import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,Check,PackagePlus,Save,Shuffle,X} from 'lucide-react';
import {purchasePriceFor,type ProductCreateOptions,type ProductCreateResult,type ProductTaxType,type ProductType} from '@koperasi/domain/inventory';

const errors:Record<string,string>={INVALID_INPUT:'Periksa kolom wajib, format harga, dan jumlah stok. Diskon tidak boleh melebihi harga jual dan beberapa karakter mungkin tidak didukung.',FORBIDDEN:'Akun Anda tidak memiliki izin menambah produk di cabang ini.',IDENTIFIER_EXISTS:'Barcode, barcode kemasan, SKU, atau kode barang sudah dipakai produk lain di cabang ini.',WRITE_NOT_CONFIGURED:'Penyimpanan produk belum diaktifkan. Hubungi pengelola.',PRODUCTS_UNAVAILABLE:'Data form belum dapat dimuat. Periksa koneksi dan coba lagi.'};
const rupiah=(value:string)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:Number(value)%1?2:0,maximumFractionDigits:2}).format(Number(value));
const quantity=(n:number)=>new Intl.NumberFormat('id-ID').format(n);
const money=(value:string)=>/^\d{1,10}(\.\d{1,2})?$/.test(value);
const fixed=(value:number)=>Number.isFinite(value)&&value>=0?value.toFixed(2):'';
type Form={barcode:string;packBarcode:string;name:string;type:ProductType;code:string;sku:string;categoryId:string;brandId:string;unitId:string;packQuantity:string;consignment:boolean;basePrice:string;taxId:string;taxType:ProductTaxType;margin:string;sellingPrice:string;discountPercent:string;discount:string;openingStock:string;alertQty:string;expiryDate:string;active:boolean;description:string};
const blank:Form={barcode:'',packBarcode:'',name:'',type:'Produk Jadi',code:'',sku:'',categoryId:'',brandId:'',unitId:'',packQuantity:'1',consignment:false,basePrice:'',taxId:'',taxType:'Inclusive',margin:'',sellingPrice:'',discountPercent:'0',discount:'0',openingStock:'0',alertQty:'0',expiryDate:'',active:true,description:''};
// Legacy "Generate Code": 13 random digits without a leading zero.
function randomBarcode(){const digits=crypto.getRandomValues(new Uint8Array(13));return Array.from(digits,(d,i)=>i===0?1+d%9:d%10).join('');}

export function ProductCreator({csrfToken,writes,branchName,onClose,onSaved,onFind}:{csrfToken:string;writes:boolean;branchName:string;onClose:()=>void;onSaved:(result:ProductCreateResult)=>void;onFind:(term:string)=>void}){
 const router=useRouter(),dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),nameInput=useRef<HTMLInputElement>(null);
 const [options,setOptions]=useState<ProductCreateOptions|null>(null),[form,setForm]=useState<Form>(blank);
 const [loading,setLoading]=useState(true),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[confirm,setConfirm]=useState(false);
 const tax=options?.taxes.find(t=>String(t.id)===form.taxId);
 const purchase=money(form.basePrice)&&tax?purchasePriceFor(form.basePrice,tax.rate,form.taxType):'';
 const ppob=form.type==='PPOB',stock=/^\d+$/.test(form.openingStock)?Number(form.openingStock):NaN;
 const net=money(form.sellingPrice)&&money(form.discount)?Number(form.sellingPrice)-Number(form.discount):NaN;
 const disabled=busy||loading||!options||!writes||uncertain;

 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{
  const controller=new AbortController();
  async function load(){
   try{
    const response=await fetch('/api/products/add',{cache:'no-store',signal:controller.signal});
    if(response.status===401){router.replace('/login');return;}
    const data=await response.json();if(!response.ok)throw new Error(data.error);
    if(controller.signal.aborted)return;
    const loaded:ProductCreateOptions=data.options;
    setOptions(loaded);setError('');
    setForm(previous=>({...previous,taxId:previous.taxId||String(loaded.taxes.find(t=>Number(t.rate)===0)?.id??loaded.taxes[0]?.id??'')}));
   }catch(e){if(!controller.signal.aborted)setError(errors[e instanceof Error?e.message:'']??errors.PRODUCTS_UNAVAILABLE);}
   finally{if(!controller.signal.aborted)setLoading(false);}
  }
  void load();return()=>controller.abort();
 },[reload,router]);

 // Two-way price helpers follow the legacy form: margin <-> selling price, discount % <-> discount Rp.
 function update(next:Partial<Form>){
  setConfirm(false);
  setForm(previous=>{
   const f={...previous,...next};
   const p=money(f.basePrice)&&options?.taxes.find(t=>String(t.id)===f.taxId)?Number(purchasePriceFor(f.basePrice,options.taxes.find(t=>String(t.id)===f.taxId)!.rate,f.taxType)):NaN;
   if('margin' in next&&p>=0&&f.margin!=='')f.sellingPrice=fixed(p+p*Number(f.margin)/100);
   if(('sellingPrice' in next||'basePrice' in next||'taxId' in next||'taxType' in next)&&p>0&&money(f.sellingPrice))f.margin=((Number(f.sellingPrice)-p)/p*100).toFixed(2);
   if('discountPercent' in next&&money(f.sellingPrice)&&f.discountPercent!=='')f.discount=fixed(Number(f.sellingPrice)*Number(f.discountPercent)/100);
   if(('discount' in next||'sellingPrice' in next||'margin' in next)&&money(f.sellingPrice)&&Number(f.sellingPrice)>0&&money(f.discount))f.discountPercent=(Number(f.discount)/Number(f.sellingPrice)*100).toFixed(2);
   if('type' in next&&f.type==='PPOB')f.openingStock='0';
   return f;
  });
 }
 const field=(name:keyof Form)=>({value:String(form[name]),onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>update({[name]:event.target.value} as Partial<Form>)});
 const invalidDiscount=money(form.sellingPrice)&&money(form.discount)&&Number(form.discount)>Number(form.sellingPrice);
 const invalidPack=!!form.packBarcode.trim()&&form.packBarcode.trim().toUpperCase()===form.barcode.trim().toUpperCase();

 function review(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(disabled||invalidDiscount||invalidPack)return;
  if(!money(form.basePrice)||!money(form.sellingPrice)||!money(form.discount)){setError(errors.INVALID_INPUT);return;}
  setError('');setConfirm(true);
 }
 async function save(){
  if(disabled||inFlight.current)return;
  inFlight.current=true;setBusy(true);setError('');
  const body={code:form.code,sku:form.sku,name:form.name,barcode:form.barcode,packBarcode:form.packBarcode,description:form.description,type:form.type,categoryId:Number(form.categoryId),brandId:form.brandId?Number(form.brandId):null,unitId:Number(form.unitId),packQuantity:Number(form.packQuantity),consignment:form.consignment,basePrice:form.basePrice,taxId:Number(form.taxId),taxType:form.taxType,sellingPrice:form.sellingPrice,discount:form.discount,openingStock:ppob?0:Number(form.openingStock),alertQty:Number(form.alertQty),expiryDate:form.expiryDate||null,active:form.active};
  try{
   const response=await fetch('/api/products/add',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},cache:'no-store',body:JSON.stringify(body)});
   if(response.status===401){router.replace('/login');return;}
   const data=await response.json();
   if(!response.ok){if(response.status>=500&&data.error!=='WRITE_NOT_CONFIGURED')setUncertain(true);throw new Error(data.error);}
   inFlight.current=false;onSaved(data as ProductCreateResult);return;
  }catch(e){
   const code=e instanceof Error?e.message:'';
   if(!errors[code]||code==='PRODUCTS_UNAVAILABLE'){setUncertain(true);setError('Hasil penyimpanan belum terkonfirmasi. Cari barcode produk di daftar sebelum mencoba menambah lagi.');}
   else setError(errors[code]);
  }finally{inFlight.current=false;setBusy(false);setConfirm(false);}
 }
 function close(){if(!inFlight.current)dialog.current?.close();}
 const select=(name:'categoryId'|'brandId'|'unitId',label:string,list:ProductCreateOptions['units'],required:boolean)=><label>{label}{required&&<span>*</span>}<select name={name} required={required} {...field(name)}><option value="">{required?'Pilih '+label.toLowerCase():'Tanpa merek'}</option>{list.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>;

 return <dialog ref={dialog} className="products-dialog products-editor" aria-labelledby="product-add-title" onClose={onClose} onCancel={event=>{if(inFlight.current)event.preventDefault();}}>
  <div className="products-dialog-heading"><span className="products-item-icon"><PackagePlus size={25}/></span><div><span className="products-eyebrow">PENGELOLAAN PRODUK</span><h2 id="product-add-title">Tambah produk</h2><span className="products-code">Produk baru untuk {branchName}</span></div><button type="button" className="products-detail-button" aria-label="Tutup tambah produk" disabled={busy} onClick={close}><X size={20}/></button></div>
  <div className="product-editor-notices">
   {!writes&&<p className="product-editor-warning">{errors.WRITE_NOT_CONFIGURED}</p>}
   {error&&<div className="product-editor-error" role="alert"><p>{error}</p>{!options&&<button type="button" className="products-button" disabled={loading} onClick={()=>{setLoading(true);setError('');setReload(n=>n+1);}}>Coba lagi</button>}{uncertain&&form.barcode&&<button type="button" className="products-button" onClick={()=>onFind(form.barcode.trim())}>Cari barcode {form.barcode.trim()}</button>}</div>}
  </div>
  {loading?<div className="product-editor-loading" role="status">Memuat kategori, satuan, dan pajak…</div>:options&&<form className="product-editor-form" onSubmit={review}>
   <fieldset disabled={disabled||confirm}>
    <section><h3>Identitas produk</h3><p>Barcode dipakai kasir saat memindai. Kode barang dibuat otomatis bila dikosongkan.</p><div className="product-editor-grid">
     <label>Barcode satuan <span>*</span><div className="product-editor-inline"><input autoFocus name="barcode" maxLength={100} required autoComplete="off" {...field('barcode')} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();nameInput.current?.focus();}}}/><button type="button" className="products-button" onClick={()=>update({barcode:randomBarcode()})}><Shuffle size={14}/>Buat</button></div></label>
     <label>Barcode kemasan<input name="packBarcode" maxLength={100} autoComplete="off" aria-invalid={invalidPack} {...field('packBarcode')}/>{invalidPack&&<small className="product-editor-hint-error">Harus berbeda dari barcode satuan.</small>}</label>
     <label className="product-editor-full">Nama barang <span>*</span><input ref={nameInput} name="name" maxLength={100} required {...field('name')}/></label>
     <label>Jenis produk<select name="type" {...field('type')}><option value="Produk Jadi">Produk Jadi</option><option value="PPOB">Tiket/Voucer/Pulsa/Token (PPOB)</option></select></label>
     <label>Kode barang<input name="code" maxLength={100} placeholder={`Otomatis · ${options.codePrefix}…`} {...field('code')}/></label>
     <label>SKU<input name="sku" maxLength={100} placeholder="Opsional" {...field('sku')}/></label>
    </div></section>
    <section><h3>Kategori &amp; satuan</h3><div className="product-editor-grid">
     {select('categoryId','Kategori',options.categories,true)}{select('brandId','Merek',options.brands,false)}{select('unitId','Satuan',options.units,true)}
     <label>Isi per kemasan<input name="packQuantity" type="number" min={1} max={2147483647} step={1} required {...field('packQuantity')}/></label>
     <label>Konsinyasi<select name="consignment" value={form.consignment?'1':'0'} onChange={event=>update({consignment:event.target.value==='1'})}><option value="0">Tidak</option><option value="1">Ya, barang titipan</option></select></label>
    </div></section>
    <section><h3>Harga &amp; pajak</h3><p>Harga dalam Rupiah per satuan. Gunakan titik untuk desimal, misalnya 4000.50.</p><div className="product-editor-grid">
     <label>Harga beli dasar <span>*</span><div className="product-editor-money"><span>Rp</span><input name="basePrice" type="number" min={0} max="9999999999.99" step="0.01" required placeholder="Sebelum pajak" {...field('basePrice')}/></div></label>
     <label>Pajak <span>*</span><select name="taxId" required {...field('taxId')}>{options.taxes.map(t=><option key={t.id} value={t.id}>{t.name.includes('%')?t.name:`${t.name} · ${Number(t.rate)}%`}</option>)}</select></label>
     <label>Perhitungan pajak<select name="taxType" {...field('taxType')}><option value="Inclusive">Tanpa tambahan pajak</option><option value="Exclusive">Tambahkan pajak ke harga beli</option></select></label>
     <label>Margin keuntungan<div className="product-editor-money"><input name="margin" type="number" step="0.01" min={-100} placeholder="Opsional" {...field('margin')}/><span>%</span></div></label>
     <label>Harga jual <span>*</span><div className="product-editor-money"><span>Rp</span><input name="sellingPrice" type="number" min={0} max="9999999999.99" step="0.01" required {...field('sellingPrice')}/></div></label>
     <label>Diskon per satuan<div className="product-editor-split"><div className="product-editor-money"><input name="discountPercent" type="number" min={0} max={100} step="0.01" aria-label="Diskon persen" {...field('discountPercent')}/><span>%</span></div><div className="product-editor-money"><span>Rp</span><input name="discount" type="number" min={0} max="9999999999.99" step="0.01" required aria-label="Diskon rupiah" aria-invalid={invalidDiscount} {...field('discount')}/></div></div>{invalidDiscount&&<small className="product-editor-hint-error">Diskon melebihi harga jual.</small>}</label>
    </div>
     <div className="product-price-strip" aria-label="Ringkasan harga"><div><span>Harga beli final</span><strong>{purchase?rupiah(purchase):'—'}</strong></div><ArrowRight size={17} aria-hidden="true"/><div><span>Harga jual</span><strong>{money(form.sellingPrice)?rupiah(form.sellingPrice):'—'}</strong></div><div className={`product-price-margin ${purchase&&money(form.sellingPrice)&&Number(form.sellingPrice)<Number(purchase)?'product-price-loss':''}`}><span>Laba per satuan</span><strong>{purchase&&!Number.isNaN(net)?rupiah((net-Number(purchase)).toFixed(2)):'—'}</strong><small>setelah diskon</small></div></div>
    </section>
    <section><h3>Stok awal</h3><p>{ppob?'Stok produk PPOB dikelola melalui transaksi PPOB, sehingga stok awal tidak diisi.':'Stok awal dicatat sebagai “Stok Awal” pada riwayat stok cabang aktif.'}</p><div className="product-editor-grid">
     <label>Stok awal<input name="openingStock" type="number" min={0} max={2147483647} step={1} required disabled={ppob} {...field('openingStock')}/></label>
     <label>Stok minimum<input name="alertQty" type="number" min={0} max={2147483647} step={1} required {...field('alertQty')}/></label>
     <label>Tanggal kedaluwarsa<input name="expiryDate" type="date" min="2000-01-01" {...field('expiryDate')}/></label>
     <label>Status produk<select name="active" value={form.active?'1':'0'} onChange={event=>update({active:event.target.value==='1'})}><option value="1">Aktif · tampil di kasir</option><option value="0">Draf · belum dijual</option></select></label>
     <label className="product-editor-full">Deskripsi<textarea name="description" rows={3} maxLength={5000} {...field('description')}/></label>
    </div></section>
   </fieldset>
   {confirm&&<div className="product-stock-confirm" role="region" aria-label="Konfirmasi tambah produk"><Check size={18}/><div><strong>Simpan “{form.name.trim()}” ke {branchName}?</strong><p>Barcode {form.barcode.trim()} · harga jual {rupiah(form.sellingPrice)} · stok awal {quantity(Number.isNaN(stock)?0:stock)} · {form.active?'aktif':'draf'}</p></div></div>}
   <div className="products-dialog-footer"><p>Gambar produk belum didukung di form ini.</p><div className="product-editor-footer-actions"><button type="button" className="products-button" disabled={busy} onClick={()=>confirm?setConfirm(false):close()}>{confirm?'Kembali':'Batal'}</button>{confirm?<button type="button" className="products-button products-primary" autoFocus disabled={disabled} onClick={()=>void save()}><Save size={15}/>{busy?'Menyimpan…':'Ya, simpan produk'}</button>:<button type="submit" className="products-button products-primary" disabled={disabled||invalidDiscount||invalidPack}>Tinjau produk<ArrowRight size={15}/></button>}</div></div>
  </form>}
 </dialog>;
}
