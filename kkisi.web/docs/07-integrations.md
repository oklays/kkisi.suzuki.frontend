# Phase 7 — External Integrations

## 7.1 IAK API (PPOB Provider)

**Package:** `iak-id/iak-api-php ^1.0`  
**Classes used:** `IakID\IakApiPHP\Services\IAKPrepaid`, `IakID\IakApiPHP\IAK`

### Configuration
```
// .env.production
IAK_USERPHONE=<production_phone>
IAK_APIKEY=<production_key>
IAK_ENV=production

// .env.testing
IAK_USERPHONE=<sandbox_phone>
IAK_APIKEY=<sandbox_key>
IAK_ENV=sandbox
```

### API Operations Used

| Method | Endpoint | Purpose |
|--------|---------|---------|
| `IAKPrepaid::checkBalance()` | IAK Balance | Check IAK wallet balance |
| `IAKPrepaid::checkOperator($phone)` | IAK Operator | Detect mobile carrier from phone |
| `IAKPrepaid::inquiryPLN($meter_no)` | IAK PLN | Validate PLN meter/customer number |
| `IAKPrepaid::topUp($...)` | IAK TopUp | Execute prepaid top-up transaction |

### Response Format (IAK)
```json
{
  "data": {
    "rc": "00",
    "message": "SUCCESS",
    "operator": "Telkomsel",
    "status": "1"
  }
}
```

### Error Handling
- `rc != '00'` → return error JSON with IAK message
- PLN: `status != '1'` → invalid meter number
- Phone < 10 digits → client-side validation before API call

---

## 7.2 PHPMailer (SMTP Email)

**Library:** Bundled at `application/libraries/phpmailer/`  
**Version:** Not pinned (manual copy)

### Configuration Source
All SMTP settings read from `db_sitesettings` at runtime:

| Setting | DB Column |
|---------|----------|
| SMTP Host | `domain` |
| Username | `email` |
| Password | `password` |
| Security | `smtp_secure` (`ssl`/`tls`) |
| Port | `port` |
| From Name | `site_name` |

### Email Functions

**`kirim_email($subjek, $message, $tujuan)`**
- Renders `email_template` view as HTML body
- Silent fail (no exception handling visible)

**`sendmail($to, $subject, $message)`**
- Full exception handling
- Enables `SMTP::DEBUG_SERVER` (⚠️ debug output to browser in production)
- Returns `true`/`false`

### Use Cases
- OTP for password reset (`Login::send_otp`)
- Notification emails (configurable)

---

## 7.3 PHPSpreadsheet (Excel Export)

**Package:** `phpoffice/phpspreadsheet ^1.8`

### Usage Pattern
```php
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$spreadsheet = new Spreadsheet();
$sheet = $spreadsheet->getActiveSheet();

// Set cells
$sheet->setCellValue('A1', $title);
$sheet->mergeCells('A1:B1');
$sheet->getStyle('A1:B1')->applyFromArray($style_col);

// Output
$writer = new Xlsx($spreadsheet);
header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Content-Disposition: attachment; filename="report.xlsx"');
$writer->save('php://output');
```

### Reports with Excel Export
| Route | Report |
|-------|--------|
| `GET /reports/export_lap_toko` | Branch P&L (Laporan Toko) |
| `GET /inventory/download_doc_no/{id}` | Stock Opname document |
| (Purchase print_rr) | Receiving Report |

---

## 7.4 Internal JSON API (`Api_c`)

This is an **unauthenticated** internal API for external consumption (e.g., mobile app, barcode scanner).

### Endpoints

**`POST /api_c/getListSo`**
```
Request: { company_id: int }
Response: [ { id, doc_no, doc_date_start, doc_date_end, doc_status, ... } ]
```

**`POST /api_c/getListDetailSo`**
```
Request: { company_id: int, so_id: int, username: string }
Response: [ { item details with quantities... } ]
```

**⚠️ Security Note:** No authentication on this controller — any caller with network access can query SO data.

---

## 7.5 SMS Gateway Integration

**Table:** `db_smsapi`  
**Controller:** `Sms`

### SMS Send Flow
```php
// In Sms_model
$gateway_url = db_smsapi.gateway_url;
$api_key     = db_smsapi.api_key;
$sender_id   = db_smsapi.sender_id;

// HTTP POST to gateway
file_get_contents($gateway_url . "?key=$api_key&to=$mobile&message=$content&sender=$sender_id")
// or curl-based depending on implementation
```

Gateway URL, API key, and sender ID are configurable from admin panel.

### SMS Templates
Managed via `Templates` controller:
- Template 1: Sales greeting
- Template 2: Sales return notification
- Variable substitution via `str_replace()` with `{{variable}}` placeholders

---

## 7.6 AES-256-CBC URL Encryption

**Helper:** `mysecurity_helper.php`  
**Config file:** `security.ini` (in webroot — ⚠️ potentially web-accessible)

```php
function encrypt_url($string) {
    $security = parse_ini_file("security.ini");
    $key = hash("sha256", $security["encryption_key"]);
    $iv  = substr(hash("sha256", $security["iv"]), 0, 16);
    return openssl_encrypt($string, "AES-256-CBC", $key, 0, $iv);
    // NOTE: base64_encode call is commented out — returns raw cipher
}
function decrypt_url($string) {
    // NOTE: base64_decode call is commented out — expects raw cipher
    return openssl_decrypt($string, "AES-256-CBC", $key, 0, $iv);
}
```

**⚠️ Bug:** The `$output = false` is initialized but `$output` is never set to the encryption result in `encrypt_url()` — always returns `false`. The decrypt function works correctly. This means URL encryption is broken; only decryption from externally encrypted values works.

---

## 7.7 Barcode Generation (`Barcode` Controller)

Used in label printing for `Items::labels` and `Items::preview_labels`. The `Barcode` controller likely wraps a barcode generation library (possibly the Zend Barcode from `application/libraries/Zend.php`).

---

## 7.8 phpdotenv

**Package:** `vlucas/phpdotenv ^4.3`

Used to load IAK API credentials from `.env.production` or `.env.testing` file based on application environment setting.

```php
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__, '.env.production');
$dotenv->load();
```
