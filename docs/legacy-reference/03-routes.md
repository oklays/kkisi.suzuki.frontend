# Phase 3 — Route Inventory

> CodeIgniter 3 uses convention-based routing: `/{controller}/{method}/{param}`  
> The only custom route: default controller = `login` (`$route['default_controller'] = 'login'`)

---

## 3.1 Authentication Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/` | `Login::index` | Redirect to login form |
| GET | `/login` | `Login::index` | Login form |
| POST | `/login/verify` | `Login::verify` | Process credentials |
| GET/POST | `/login/forgot_password` | `Login::forgot_password` | Password reset request |
| POST | `/login/send_otp` | `Login::send_otp` | Send OTP via email |
| POST | `/login/otp` | `Login::otp` | OTP verification page |
| POST | `/login/verify_otp` | `Login::verify_otp` | Validate OTP code |
| POST | `/login/change_password` | `Login::change_password` | Set new password |
| POST | `/login/getKasir` | `Login::getKasir` | Get available kasir list (JSON) |
| GET | `/logout` | `Logout::index` | Destroy session |
| GET | `/csrfdata` | `Csrfdata::index` | CSRF token JSON endpoint |

---

## 3.2 POS Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/pos` | `Pos::index` | POS terminal UI |
| POST | `/pos/getnik` | `Pos::getnik` | Member lookup by NIK (JSON) |
| POST | `/pos/getnik_qr` | `Pos::getnik_qr` | Member lookup by QR code |
| POST | `/pos/getidcard` | `Pos::getidcard` | Member lookup by ID card |
| POST | `/pos/search_item` | `Pos::search_item` | Product search (JSON) |
| POST | `/pos/detailanggota/{id}` | `Pos::detailanggota` | Member credit detail |
| POST | `/pos/cek_sisa_limit` | `Pos::cek_sisa_limit` | Remaining credit limit check |
| POST | `/pos/detailitems` | `Pos::detailitems` | Item details JSON |
| POST | `/pos/add_to_cart` | `Pos::add_to_cart` | Add item to cart |
| POST | `/pos/add_to_cart_new` | `Pos::add_to_cart_new` | Add item (new variant) |
| POST | `/pos/update_cart` | `Pos::update_cart` | Update cart quantities |
| POST | `/pos/update_payment` | `Pos::update_payment` | Update payment method on cart |
| POST | `/pos/update_type` | `Pos::update_type` | Update sale type (cash/kredit) |
| POST | `/pos/update_anggota` | `Pos::update_anggota` | Assign member to cart |
| POST | `/pos/pos_save` | `Pos::pos_save` | Save/finalize POS transaction |
| POST | `/pos/pos_update` | `Pos::pos_update` | Edit existing POS sale |
| POST | `/pos/pilih_kasir` | `Pos::pilih_kasir` | Open/select kasir |
| GET | `/pos/new_invoice` | `Pos::new_invoice` | Generate new invoice UUID |
| GET | `/pos/print_invoice_pos/{id}` | `Pos::print_invoice_pos` | Print POS receipt |
| POST | `/pos/get_hold_invoice_list` | `Pos::get_hold_invoice_list` | List held invoices |
| GET | `/pos/get_hold_invoice_count` | `Pos::get_hold_invoice_count` | Count held invoices |
| GET | `/pos/edit/{id}` | `Pos::edit` | Edit held invoice |
| GET | `/print_pos/pos/{id}` | `Print_pos::pos` | Standalone print invoice |

---

## 3.3 PPOB Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/ppob/pos_ppob` | `Pos_ppob::index` | PPOB POS UI |
| POST | `/ppob/pos_ppob/getnik` | `Pos_ppob::getnik` | Member NIK search |
| POST | `/ppob/pos_ppob/getqr` | `Pos_ppob::getqr` | Member QR lookup |
| POST | `/ppob/pos_ppob/get_item` | `Pos_ppob::get_item` | Get PPOB products (pulsa/PLN/data) |
| GET | `/ppob/pos_ppob/detailanggota/{id}` | `Pos_ppob::detailanggota` | Member PPOB credit detail |
| POST | `/ppob/pos_ppob/checkBalance` | `Pos_ppob::checkBalance` | IAK balance check |
| POST | `/ppob/pos_ppob/inquiryPLN` | `Pos_ppob::inquiryPLN` | PLN meter/customer inquiry |
| POST | `/ppob/pos_ppob/pos_save` | `Pos_ppob::pos_save` | Save PPOB transaction |

---

## 3.4 Sales Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/sales` | `Sales::index` | Sales list |
| GET | `/sales/add` | `Sales::add` | Add sales form |
| POST | `/sales/sales_save_and_update` | `Sales::sales_save_and_update` | Create/update sale |
| POST | `/sales/ajax_list` | `Sales::ajax_list` | DataTable JSON |
| POST | `/sales/update_status` | `Sales::update_status` | Change sale status |
| POST | `/sales/delete_sales` | `Sales::delete_sales` | Delete sale |
| POST | `/sales/multi_delete` | `Sales::multi_delete` | Bulk delete |
| POST | `/sales/search_item` | `Sales::search_item` | Item search |
| GET | `/sales/invoice/{id}` | `Sales::invoice` | View invoice |
| GET | `/sales/print_invoice/{id}` | `Sales::print_invoice` | Print invoice |
| GET | `/sales/pdf/{id}` | `Sales::pdf` | PDF invoice |
| POST | `/sales/delete_payment` | `Sales::delete_payment` | Delete payment |
| POST | `/sales/show_pay_now_modal` | `Sales::show_pay_now_modal` | Payment modal |
| POST | `/sales/save_payment` | `Sales::save_payment` | Record payment |
| GET | `/sales/get_dash_total` | `Sales::get_dash_total` | Dashboard totals |

---

## 3.5 Sales Return Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/sales_return` | `Sales_return::index` | Return list |
| GET | `/sales_return/create` | `Sales_return::create` | Create return |
| POST | `/sales_return/sales_save_and_update` | `Sales_return::sales_save_and_update` | Save return |
| POST | `/sales_return/ajax_list` | `Sales_return::ajax_list` | DataTable JSON |
| GET | `/sales_return/invoice/{id}` | `Sales_return::invoice` | Return invoice |

---

## 3.6 Sales Mobile Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/sales_mobile` | `Sales_mobile::index` | Mobile orders list |
| POST | `/sales_mobile/ajax_list` | `Sales_mobile::ajax_list` | DataTable with status filter |
| POST | `/sales_mobile/update_status` | `Sales_mobile::update_status` | Order lifecycle transition |
| GET | `/sales_mobile/invoice/{id}` | `Sales_mobile::invoice` | Order invoice view |
| POST | `/sales_mobile/pos_update` | `Sales_mobile::pos_update` | Process mobile order as POS |

---

## 3.7 Purchase Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/purchase` | `Purchase::index` | Purchase list |
| GET | `/purchase/konsinyasi` | `Purchase::konsinyasi` | Consignment list |
| GET | `/purchase/add` | `Purchase::add` | Add purchase form |
| GET | `/purchase/add_konsinyasi` | `Purchase::add_konsinyasi` | Add consignment form |
| POST | `/purchase/purchase_save_and_update` | `Purchase::purchase_save_and_update` | Save regular purchase |
| POST | `/purchase/purchase_save_and_update_konsinyasi` | `Purchase::purchase_save_and_update_konsinyasi` | Save consignment |
| POST | `/purchase/ajax_list` | `Purchase::ajax_list` | DataTable |
| POST | `/purchase/delete_purchase` | `Purchase::delete_purchase` | Delete purchase |
| GET | `/purchase/invoice/{id}` | `Purchase::invoice` | View PO invoice |
| GET | `/purchase/print_rr/{id}` | `Purchase::print_rr` | Print receiving report |
| POST | `/purchase/save_payment` | `Purchase::save_payment` | Record supplier payment |
| GET | `/purchase/get_dash_total` | `Purchase::get_dash_total` | Dashboard purchase totals |

---

## 3.8 Inventory Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/inventory` | `Inventory::index` | Inventory list |
| GET | `/inventory/stock_opname` | `Inventory::stock_opname` | Stock opname list |
| POST | `/inventory/new_so` | `Inventory::new_so` | Create stock opname doc |
| GET | `/inventory/view_detail/{id}` | `Inventory::view_detail` | SO detail view |
| POST | `/inventory/ajax_list` | `Inventory::ajax_list` | Item list DataTable |
| POST | `/inventory/ajax_list_so` | `Inventory::ajax_list_so` | SO list DataTable |
| GET | `/inventory/download_doc_no/{id}` | `Inventory::download_doc_no` | Download SO Excel |
| POST | `/inventory/ajax_edit` | `Inventory::ajax_edit` | Edit SO line |
| POST | `/inventory/delete_so` | `Inventory::delete_so` | Delete SO |

---

## 3.9 Items Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/items` | `Items::index` | Products list |
| GET | `/items/penyesuaian_stok` | `Items::penyesuaian_stok` | Stock adjustment list |
| GET | `/items/add` | `Items::add` | Add product form |
| POST | `/items/newitems` | `Items::newitems` | Save new product |
| POST | `/items/update_items` | `Items::update_items` | Update product |
| POST | `/items/ajax_list` | `Items::ajax_list` | DataTable |
| POST | `/items/delete_items` | `Items::delete_items` | Delete product |
| GET | `/items/labels` | `Items::labels` | Barcode label generator |
| POST | `/items/save_penyesuaian_stok` | `Items::save_penyesuaian_stok` | Save stock adjustment |
| POST | `/items/save_brand` | `Items::save_brand` | Quick-add brand |
| POST | `/items/save_category` | `Items::save_category` | Quick-add category |
| POST | `/items/save_satuan` | `Items::save_satuan` | Quick-add unit |
| POST | `/items/save_tax` | `Items::save_tax` | Quick-add tax |

---

## 3.10 Member Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/member` | `Member::index` | Member list |
| POST | `/member/ajax_list` | `Member::ajax_list` | DataTable with credit balances |
| POST | `/member/save_member` | `Member::save_member` | Create member |
| POST | `/member/update_member` | `Member::update_member` | Update member |
| POST | `/member/get_json_member_details` | `Member::get_json_member_details` | JSON member details |
| POST | `/member/get_json_member_idcard` | `Member::get_json_member_idcard` | JSON by ID card |
| POST | `/member/get_json_member_nik` | `Member::get_json_member_nik` | JSON by NIK |
| POST | `/member/save_payment` | `Member::save_payment` | Record member payment |

---

## 3.11 Kasir (Register) Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/kasir/buka_kasir` | `Kasir::buka_kasir` | Open register list |
| GET | `/kasir/detail_regiter/{id}` | `Kasir::detail_regiter` | Register detail view |
| GET | `/kasir/master_kasir` | `Kasir::master_kasir` | Kasir master setup |
| POST | `/kasir/ajax_list` | `Kasir::ajax_list` | DataTable |
| POST | `/kasir/ajax_add_master` | `Kasir::ajax_add_master` | Add master kasir |
| POST | `/kasir/ajax_tutup_kasir` | `Kasir::ajax_tutup_kasir` | Close register |
| GET | `/kasir/print_kasir` | `Kasir::print_kasir` | Print register summary |

---

## 3.12 Reports Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| GET | `/reports/sales` | `Reports::sales` | Sales report page |
| POST | `/reports/show_sales_report` | `Reports::show_sales_report` | Sales report data |
| GET | `/reports/sales_return` | `Reports::sales_return` | Sales return report |
| GET | `/reports/purchase` | `Reports::purchase` | Purchase report |
| GET | `/reports/expense` | `Reports::expense` | Expense report |
| GET | `/reports/toko` | `Reports::toko` | Branch P&L report |
| GET | `/reports/export_lap_toko` | `Reports::export_lap_toko` | Excel export branch P&L |
| GET | `/reports/profit_loss` | `Reports::profit_loss` | Profit & loss report |
| GET | `/reports/stock` | `Reports::stock` | Stock report |
| GET | `/reports/expired_items` | `Reports::expired_items` | Expiring products |
| POST | `/reports/show_toko_report` | `Reports::show_toko_report` | Branch report data |

---

## 3.13 Internal API Routes

| Method | URL Pattern | Controller::Method | Notes |
|--------|------------|-------------------|-------|
| POST | `/api_c/getListSo` | `Api_c::getListSo` | Get SO list for a company |
| POST | `/api_c/getListDetailSo` | `Api_c::getListDetailSo` | Get SO details |

> **Note:** `Api_c` extends `CI_Controller` directly — **no authentication guard**. Anyone can POST to these endpoints.

---

## 3.14 Admin/Config Routes

| Method | URL Pattern | Controller::Method |
|--------|------------|-------------------|
| GET/POST | `/users` | `Users::index` / `save_or_update` |
| GET/POST | `/roles` | `Roles::view` / `newrole` |
| GET/POST | `/site` | `Site::index` / `update_site` |
| GET | `/users/dbbackup` | `Users::dbbackup` |
| GET | `/updates/update_db` | `Updates::update_db` |
| GET | `/menu` | `Menu::index` |
| GET | `/templates/sms` | `Templates::sms` |
| GET | `/sms` | `Sms::index` |
| POST | `/sms/send_message` | `Sms::send_message` |
| GET | `/import/items` | `Import::items` |
| POST | `/import/import_items_csv` | `Import::import_items_csv` |
