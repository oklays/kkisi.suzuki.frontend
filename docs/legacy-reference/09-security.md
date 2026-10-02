# Phase 9 — Security Analysis

## 9.1 Authentication

### Login Mechanism
- **Password storage:** bcrypt via `password_verify()` ✅
- **Session-based auth:** CodeIgniter native sessions
- **OTP flow:** Email-based OTP for password reset (via PHPMailer)

### MY_Controller Auth Gate
```php
// Every protected controller calls:
$this->load_global(); // which checks session
// Redirect to login if not logged_in
```

### Session Variables (Security-Relevant)
```php
$this->session->set_userdata([
    'logged_in'  => true,
    'role_id'    => $role_id,
    'company_id' => $company_id,
    // ...
]);
```

---

## 9.2 Role-Based Access Control (RBAC)

### Permission Check
```php
public function permission_check($perm) {
    $role_id = $this->session->userdata('role_id');
    // Check db_permissions WHERE role_id=? AND perm_name=?
    if (!has_permission) {
        redirect('dashboard'); // or show error
    }
}
```

### Permission Slugs Observed
| Slug | Description |
|------|-------------|
| `sales_add` | Can create POS sales |
| `sales_view` | Can view sales list |
| `sales_report` | Can view sales reports |
| `sales_return_report` | Sales return reports |
| `purchase_report` | Purchase reports |
| `purchase_return_report` | Purchase return reports |
| `expense_report` | Expense reports |
| `profit_report` | Profit/loss reports |
| `master_kasir` | Access kasir management |
| `member_view` | View member list |

---

## 9.3 SQL Injection Vulnerabilities

### ⛔ Critical — Direct Variable Interpolation

Multiple locations use unsanitized variables directly in query strings:

**`Login_model.php` (login username):**
```php
$this->db->query("SELECT * FROM db_users WHERE username='$username'");
// $username is raw POST — SQLI possible
```

**`Pos_ppob.php` (company_id from session):**
```php
$this->db->query("SELECT * FROM db_company where id='$company_id' and status=1");
// company_id from session — less risky but still bad practice
```

**`Pos_ppob.php` (member ID from URL):**
```php
$id = decrypt_url($ids);
$sql = $this->db->query("SELECT a.* from m_anggota a where a.id='$id'");
// If decrypt_url fails (returns false), query becomes WHERE a.id='', safe but silently fails
// If someone crafts a valid encrypted payload, could inject
```

**`custom_helper.php` (`tagihan_anggota`):**
```php
$CI->db->query("SELECT ... FROM db_sales WHERE nik_kar='$nik' and ...");
// $nik comes from session/member lookup — second-order injection possible
```

**`custom_helper.php` (loan functions):**
```php
$CI->db->query("SELECT * from trans_pinjaman where doc_no='$doc_no'");
// $doc_no propagated from user input in loan module
```

### ✅ Where CI Query Builder IS Used (Parameterized)
- Most model DataTable queries use `$this->db->where()`, `$this->db->like()` — these are safe
- `$this->db->insert()`, `$this->db->update()` with array input — safe

### Summary
| Risk Level | Location | Issue |
|-----------|----------|-------|
| 🔴 Critical | `Login_model` | Username not parameterized |
| 🟠 High | `Pos_ppob` | Direct string queries |
| 🟡 Medium | `custom_helper` | tagihan_anggota, cek_buka_kasir |
| 🟡 Medium | `custom_helper` | Loan functions (doc_no) |

---

## 9.4 XSS (Cross-Site Scripting)

### Input Sanitization
- `cetak($str)` function: `escape_str(strip_tags(htmlentities($str, ENT_QUOTES, 'UTF-8')))` — used in some places
- CodeIgniter's `xss_clean` filter used selectively (seen in `Pos_ppob::get_item` form_validation)
- `$this->input->post()` without `xss_clean = true` in many controllers

### Output Escaping
- Views render data directly without `htmlspecialchars()` in many places
- DataTable responses build raw HTML strings server-side — XSS possible if item names contain `<script>`

### Risk
- 🟠 Medium-High: Item names, customer names, notes could contain HTML/JS if not sanitized on input

---

## 9.5 CSRF Protection

- `Csrfdata` controller provides a CSRF token endpoint
- CodeIgniter's built-in CSRF protection may be enabled/disabled via `config.php`
- AJAX endpoints accept `$_POST` data — CSRF protection depends on config

---

## 9.6 URL Encryption (`mysecurity_helper.php`)

### Implementation
```php
// AES-256-CBC with SHA-256 key derivation
$key = hash("sha256", $secret_key);
$iv  = substr(hash("sha256", $secret_iv), 0, 16);
openssl_encrypt($id, "AES-256-CBC", $key, 0, $iv);
```

### ⚠️ Bug: `encrypt_url()` Always Returns `false`
```php
function encrypt_url($string) {
    $output = false;
    // ...
    $result = openssl_encrypt($string, ...); // computed correctly
    // $output = base64_encode($result);  // LINE IS COMMENTED OUT
    return $output;  // always returns false!
}
```
**Impact:** Any code calling `encrypt_url()` gets `false` instead of a cipher — IDs are exposed as `false` in URLs.

### `decrypt_url()` Works Correctly
```php
function decrypt_url($string) {
    $output = false;
    // ...
    $output = openssl_decrypt($string, ...);  // correctly assigned
    return $output;
}
```

---

## 9.7 `security.ini` Exposure Risk

```
application/helpers/security.ini
```

This file contains AES encryption keys. If the web server is misconfigured and serves `.ini` files directly, encryption keys would be exposed.

**Mitigation needed:** Move `security.ini` outside webroot, or add `.htaccess` rule:
```apache
<Files "*.ini">
    Order Allow,Deny
    Deny from all
</Files>
```

---

## 9.8 Unauthenticated API Endpoint

```php
class Api_c extends CI_Controller {  // NOT MY_Controller
    // No permission_check, no session check
    public function getListSo() { ... }
    public function getListDetailSo() { ... }
}
```

**Risk:** Anyone who can reach the server can query Stock Opname data by POSTing any `company_id`.

---

## 9.9 License / Hardware Lock

`appinfo_helper.php` implements a hardware fingerprint check:
- Uses `blkid` (Linux) or `diskpart` (Windows) via `shell_exec`
- Stores MD5 hash in `db_sitesettings.machine_id`
- Domain locked in `db_sitesettings.domain`

**⚠️ `shell_exec` usage:** If `shell_exec` is disabled in PHP (common on shared hosting), `appinfo()` falls back gracefully (returns empty string result).

---

## 9.10 Database Backup Exposure

`Users::dbbackup` creates database dumps accessible via HTTP. If the backup file is stored in a web-accessible path without authentication, it would expose all data.

---

## 9.11 SMTP Debug in Production

```php
// sendmail() in sms_template_helper.php
$mail->SMTPDebug = SMTP::DEBUG_SERVER;
```

This outputs verbose SMTP debug information to the HTTP response — **must be disabled in production** (set to `SMTP::DEBUG_OFF`).

---

## 9.12 CORS Policy

```php
header("Access-Control-Allow-Origin: *");
```

Set globally in `config.php` and on `Api_c`. Allows any origin to make requests — appropriate for a private intranet but risky on public internet.

---

## 9.13 Security Recommendations

| Priority | Finding | Fix |
|----------|---------|-----|
| 🔴 P1 | SQL injection in `Login_model` | Use parameterized queries |
| 🔴 P1 | SQL injection in `Pos_ppob` | Use `$this->db->where()` |
| 🟠 P2 | `encrypt_url()` always returns false | Uncomment `$output = base64_encode($result)` |
| 🟠 P2 | `security.ini` in webroot | Move outside webroot |
| 🟠 P2 | `Api_c` has no auth | Add session/token check |
| 🟡 P3 | XSS in DataTable output | `htmlspecialchars()` all user data in views |
| 🟡 P3 | SMTP debug enabled | Set `SMTPDebug = SMTP::DEBUG_OFF` |
| 🟡 P3 | DB backup in webroot | Store backups outside webroot |
| 🟢 P4 | `Access-Control-Allow-Origin: *` | Restrict to known origins |
