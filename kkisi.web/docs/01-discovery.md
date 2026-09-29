# Phase 1 — Discovery & Stack Analysis

## 1.1 Framework & Runtime

| Property | Value |
|----------|-------|
| Framework | CodeIgniter **3.1.11** |
| App Version | **2.0.1** (from `custom_helper.php::app_version()`) |
| PHP Minimum | `>=5.3.7` (composer.json) |
| Timezone | `Asia/Bangkok` (UTC+7) |
| Charset | UTF-8 |
| Default Controller | `login` |
| Base URL | Configured dynamically |
| CORS | `Access-Control-Allow-Origin: *` (global) |

---

## 1.2 Directory Structure

```
tokonew.kkisitb2.id/
├── application/
│   ├── config/
│   │   ├── autoload.php        # Autoloaded libs, helpers, models
│   │   ├── config.php          # CI base config, timezone, CORS
│   │   ├── database.php        # DB connection config
│   │   └── routes.php          # URL routing (default: login)
│   ├── controllers/
│   │   ├── *.php               # 40+ controllers (flat namespace)
│   │   └── ppob/
│   │       └── Pos_ppob.php    # PPOB sub-module controller
│   ├── models/
│   │   └── *.php               # 38 models
│   ├── views/
│   │   └── *.php / *.html      # View templates
│   ├── helpers/
│   │   ├── custom_helper.php   # Business utility functions
│   │   ├── appinfo_helper.php  # License / machine ID checks
│   │   ├── mysecurity_helper.php # encrypt_url / decrypt_url (AES-256-CBC)
│   │   └── sms_template_helper.php # SMS + PHPMailer email dispatch
│   ├── libraries/
│   │   ├── phpmailer/          # PHPMailer (bundled, not composer)
│   │   └── Zend.php
│   └── core/
│       └── MY_Controller.php   # Base controller with auth/permission
├── vendor/                     # Composer dependencies
├── system/                     # CodeIgniter system core
├── user_guide/                 # CI 3 docs (bundled)
├── composer.json
├── .env.production             # IAK API credentials (production)
├── .env.testing                # IAK API credentials (testing)
└── security.ini                # AES-256-CBC keys for URL encryption
```

---

## 1.3 Composer Dependencies

```json
{
  "require": {
    "phpoffice/phpspreadsheet": "^1.8",
    "iak-id/iak-api-php": "^1.0",
    "vlucas/phpdotenv": "^4.3"
  }
}
```

| Package | Purpose |
|---------|---------|
| `phpoffice/phpspreadsheet` | Excel export (laporan toko, reports) |
| `iak-id/iak-api-php` | IAK API client — PPOB (pulsa, PLN, data) |
| `vlucas/phpdotenv` | Load `.env.production` / `.env.testing` config |

Additional bundled vendor libs (not in composer):
- **PHPMailer** (`application/libraries/phpmailer/`) — SMTP email sending
- **Zend.php** (`application/libraries/Zend.php`) — PDF generation stub

---

## 1.4 Autoloaded Resources

From `application/config/autoload.php`:

```php
$autoload['libraries']  = ['database', 'session', 'form_validation'];
$autoload['helpers']    = ['url', 'custom_helper', 'appinfo_helper', 'mysecurity_helper'];
$autoload['model']      = [];  // Models loaded per-controller
```

---

## 1.5 Environment Files

### `.env.production`
```
IAK_USERPHONE=...
IAK_APIKEY=...
IAK_ENV=production
```

### `.env.testing`
```
IAK_USERPHONE=...
IAK_APIKEY=...
IAK_ENV=sandbox
```

---

## 1.6 Security Configuration (`security.ini`)

```ini
encryption_key = <secret>
iv             = <secret>
encryption_mechanism = AES-256-CBC
```

Used by `encrypt_url()` / `decrypt_url()` in `mysecurity_helper.php` to obfuscate record IDs in URLs (e.g., member detail pages).

---

## 1.7 License Check (`appinfo_helper.php`)

The application implements a **hardware-fingerprint license check**:
- On Linux: uses `blkid -o value -s UUID` to get disk UUID
- On Windows: uses `diskpart` to get disk ID
- Computes `md5(salt . md5(hardware_id))`
- Stored machine ID in `db_sitesettings.machine_id`
- Domain locked via `db_sitesettings.domain`

---

## 1.8 Base URL & Multi-Company

- **Multi-company:** `db_company` table — each `company_id` represents a branch/toko
- Role 1–2: Super-admin/admin (see all companies)
- Role >2: Branch-scoped (filtered by `company_id` from session)
- Session key `company_id` drives all data isolation

---

## 1.9 Session Variables

| Key | Description |
|-----|-------------|
| `logged_in` | Boolean — authentication gate |
| `role_id` | RBAC role identifier |
| `inv_userid` | Authenticated user's DB ID |
| `inv_username` | Username string |
| `company_id` | Current branch/company context |
| `role_name` | Human-readable role label |
| `akses_lokasi` | Location access scope |
| `id_kasir` | Active kasir (cashier register) ID |
| `noref_kasir` | Kasir reference number |
| `view_date` | Date display format (`dd/mm/yyyy` | `mm/dd/yyyy`) |
| `view_time` | Time display format (`24` | `12`) |
