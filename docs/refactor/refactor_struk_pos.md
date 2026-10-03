Ubah struktur struk yang saat ini sudah ada menjadi seperti berikut ini :

1. Tambahkan informasi ```Telp: +62 822-2333-1148```, dibawah baris setelah Alamat.

2. Ubah label ```Anggota``` menjadi ```Pelanggan: {NAMA_ANGGOTA}```. (Field ini hanya muncul jika terpilih ANGGOTA dan Nik tidak kosong).

3. Tambahkan field ```Nik: {NIK_ANGGOTA}``` anggota dibawah field ```Pelanggan```. (Field ini hanya muncul jika terpilih ANGGOTA dan Nik tidak kosong).

4. Ubah posisi ```Metode``` menjadi dibawah ```Nik```.

5. Tambahkan field ```Limit: {TOTAL_LIMIT_ANGGOTA}```. (Field ini hanya muncul jika terpilih ANGGOTA dan Nik tidak kosong).

6. Tambahkan field ```Limit Terpakai: {TOTAL_LIMIT_ANGGOTA_YANG_TERPAKAI}``` (Field ini hanya muncul jika terpilih ANGGOTA dan Nik tidak kosong).

7. Tambahkan field ```Sisa Limit: {TOTAL_LIMIT_ANGGOTA_YANG_TERPAKAI}``` (Field ini hanya muncul jika terpilih ANGGOTA dan Nik tidak kosong).

8. Tambahkan satu row untuk ```Item | Qty | Harga | Total``` diatas list product.

9. Tambhakan ```PPN = 0``` dibawah row ```Subtotal```.

10. Hapus row ```Tagihan Kredit```.

11. Tambahkan kalimat ```Harga Sudah Termasuk PPN``` dibagian paling bawah struk setelah ```Terima kasih atas...```.

NOTE : Untuk point no. ```5, 6, 7``` pastikan hasil total perhitungan sudah termasuk dari transaksi yang sedang berlangsung pada saat itu.