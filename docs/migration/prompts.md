# POS INTEGRATION

okay buddy, jadi saya ingin membuat function serta mengintegrasikan masing-masing POS function (Search product, Scan nik anggota, Cash/kredit, Pembayaran, dll...) ke database, dan kamu bisa mengikuti existing documentation dari Aplikasi lama : 
```markdown
`docs/migration/POS_DB_INTEGRATION_PLAN.md`: pemetaan Cash dan Kredit **sudah ada**. PRD baru akan menduplikasi pekerjaan, jadi **tidak perlu dibuat**.

Bagian relevan:
- **1.1–1.3:** alur POS lama, jalur simpan, dan tabel terdampak.
- **R3–R7:** limit anggota serta perbedaan Cash/Kredit.
- **Tahap 4–5:** rancangan checkout Cash dan Kredit di Next.js.
- **Bagian 6.17:** status gerbang dan batas izin DEV.

Koreksi jawaban saya sebelumnya: saya seharusnya memeriksa dokumen rencana itu sebelum mengusulkan PRD baru. `.kiro/specs/pos-functional-mapping/prd.md` tidak saya ubah.
```


Seluruh function pada POS/Kasir di aplikasi revamp NextJS app sudah berhasil terhubung semua.