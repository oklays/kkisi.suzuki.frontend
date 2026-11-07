# Native member registration/profile command core

T03, 2026-11-06. This is a pure domain and application slice of WI07/M03/M06 (REQ-108/109, BR-113, VAL-101/102/103/105). No repository, HTTP route, UI or production member writer is supplied or enabled here. It does not complete membership replacement.

## Interfaces

Domain export: `@koperasi/domain/kosipa/member-command`. Application export: `@koperasi/application/kosipa/commands/member`.

`registerMember(ports, actor, body)` accepts:

```json
{
  "fields": {
    "nik_kar": "00123", "nama_kar": "Example", "kd_group": "ANGGOTA",
    "bagian": "Produksi", "lokasi": "Tambun", "status_anggota": "AKTIVE",
    "tgl_daftar": "2026-11-06", "gaji": "1000000.25"
  },
  "initialDeductions": { "pokok": "0", "wajib": "100000", "sukarela": "0" },
  "idempotencyKey": "00000000-0000-4000-8000-000000000001"
}
```

`updateMemberProfile(ports, actor, recordIdString, body)` accepts:

```json
{
  "fields": { "alamat_tinggal": "Example address", "gaji": "1100000", "no_rek": "12345" },
  "expectedVersion": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "reason": "Verified bank correction",
  "idempotencyKey": "00000000-0000-4000-8000-000000000002"
}
```

Both return `CommandOutcome<{id:number,version:string}>`; there are no names, NIKs, member/document numbers, accounts or salary values in the response/ledger result. `MemberRepository.create(envelope,input)` and `.update(envelope,id,input)` define the subsequent transaction boundary. The registration command is `member.register` with `kosipa.member.create`; update is `member.updateProfile` with `kosipa.member.update`. Both use feature `member`, require member view and a linked KOSIPA operator through `runKosipaCommand`. Grantable capabilities remain master-only. Audit actions are exactly `kosipa.member.register` and `kosipa.member.updateProfile`.

Existing-target subjects use only the validated record id. Registration uses `member:new` before repository allocation, as the existing pipeline binds the request subject before execution; its generated id is returned in the PII-free result. Denied/invalid update subjects use the constant `member:route`, never an unvalidated route string. Audit detail contains command, ledger id or error code only. Canonical validated payloads bind fingerprints, including salary, deductions, version and reason; they are not audit payloads. Replay suppresses duplicate success audit.

## Field boundaries and validation

`MEMBER_FIELD_CLASSES` inventories all 72 captured `m_anggota` columns once, in identity, profile, employment, bank, salary, deduction configuration, financial controls, status, credentials/files and audit classes. `MEMBER_PROFILE_FIELDS` and `MEMBER_REGISTRATION_FIELDS` are the explicit parser allowlists. Field names are actual member column names. Unknown fields at the envelope or nested fields/config level fail with `FIELD_NOT_ALLOWED`; malformed/non-data object shapes fail rather than invoking accessors.

Registration requires nonblank name/NIK/group/bagian/lokasi and an explicit status. Registration additionally permits only `nik_kar`, `id_card`, `tgl_daftar`, `status_anggota` beyond profile/employment/bank/salary. `id_card` is identifier text, not an upload command. Generated `id`/`no_anggota`/`doc_no` and every credential/file/audit/limit/raw `sim_*` field are refused. Those identity values cannot change through profile updates. Exact statuses: AKTIVE, LUAR BIASA, KONTRAK, RESIGN, PENSIUN. Exact groups: ANGGOTA, NON ANGGOTA, BMP, KOPERASI. Other text has schema-derived bounds without invented enumerations.

Initial deductions require all three explicit decimal strings, including zero. These are configuration amounts, not savings balances. Omitted registration `gaji` becomes explicit `"0"`, matching the observed blank legacy salary input; no deduction amount is inferred. Money is nonnegative, at most 10^13, scale at most two, without signs, whitespace, commas, grouping, exponent syntax, coercion, rounding or truncation. Canonical decimal strings normalize insignificant zeros for fingerprint and salary no-change comparison. Positive registration deductions require the canonical stored NIK to fit `m_simpanan_aktif.nik_kar VARCHAR(10)`; all-zero config allows the regular 20-character canonical NIK constraint.

Repository create contract for `initialDeductions` (exposed on the parsed `MemberRegistration`): set `m_anggota.sim_pokok`/`sim_wajib`/`sim_sukarela` to the `pokok`/`wajib`/`sukarela` values exactly, including `"0"`; insert `m_simpanan_aktif` configuration rows only for positive amounts (no row for `"0"`), in the same transaction as the member row.

Text widths match the captured member table, with `no_telp` narrowed to users.phone VARCHAR(25). Mirrored `ktp`/`email`/`no_telp` refuse NULL; nullable text preserves NULL versus empty string, and omitted fields remain omitted. Printable Windows-1252 characters (MariaDB latin1), including representable accents and documented printable extensions, are accepted. C0/C1 controls, undefined cp1252 slots and unrepresentable Unicode are refused. Exception (legacy parity): `alamat` and `alamat_tinggal` are `<textarea>` inputs in legacy `anggota_v.php`, so they accept LF and CRLF line breaks (a lone CR is refused); `alamat_tinggal` mirrors to `users.street_address`, where line breaks are acceptable. Every other field still refuses all controls. No silent conversion or blanket ASCII restriction is used.

Optional date empty strings normalize to SQL-compatible NULL; explicit NULL remains NULL. Supplied nonempty dates must be real ISO calendar dates, including Gregorian leap rules and year 0001..9999. `tgl_karyawan` and `tgl_masuk` remain independent. Registration date cannot exceed the injected Jakarta business date derived from `ports.now()` using existing `businessDates`. No domain wall clock is used. `memberNikUniquenessKey` adds ASCII case folding to existing numeric canonicalization for future write uniqueness; global read helpers are unchanged.

Profile is a partial patch, never a replacement. Empty patches and semantic no-change return `NO_CHANGE`. Every supplied field is syntax-validated, including unchanged bank values. An actual change to no_rek/bank_rek/nama_rek requires the existing 5–200-character `parseReason` rule. An unchanged submitted bank field requires no reason. Change detection compares stored values tolerantly: NULL and empty string are the same nullable-text intent (the submitted value is still written as sent), numeric stored values compare by text, and a stored `gaji` that is not a canonical amount (legacy kept the sign of `(int)filter_var(..., FILTER_SANITIZE_NUMBER_INT)`, so negative/oversized rows exist) always counts as changed so it can be corrected. Submitted values remain strictly validated. One authorized operator suffices; no checker was added. The expected version is exactly 64 lowercase hexadecimal characters, reserved for server HMAC SHA256 stale checking. Existing master 16-hex tokens are unchanged.

Pure planners use injected verified active bagian/lokasi facts and preserve the matched master spelling. Updates resolve only changed references, so unrelated edits can preserve historical inactive values; a submitted value equal to the stored one under the master comparison (trimmed, case-insensitive) is unchanged and keeps the stored spelling. `planMemberProfile` exposes changed fields and a safe record-id/field-presence/field-change summary; `memberFieldSummary` supplies the same value-free summary after registration receives its generated id. Summaries contain no PII, account, salary or reason values.

## Legacy corrections and remaining acceptance

The recovered legacy contract is [MEMBERSHIP_LEGACY_CONTRACT.md](MEMBERSHIP_LEGACY_CONTRACT.md). Native core corrects the bundled update boundary, unsafe numeric sanitizer, independent-date copy defect and unvalidated shapes/charset/widths. It preserves explicit registration configuration and salary support. It does not reproduce non-strict coercion or treat configured sim_* as balances.

- Legacy `ajax_update` rewrote `tgl_daftar` and `id_card`. Natively both are registration-only identity and immutable through profile updates. There is no native correction path yet; this is a tracked gap for a later explicit, audited identity-correction command.
- The profile allowlist is wider than the legacy edit forms, per REQ-109: `nama_rek`, `divisi`, `dept`, `jabatan`, `rt`, `rw`, `provinsi`, `kabupaten`, `kecamatan`, `kelurahan`, `kode_pos` and the `*_tinggal` address parts (`kelurahan_tinggal`, `kecamatan_tinggal`, `kabupaten_tinggal`, `kode_pos_tinggal`) are editable natively although no legacy form exposed them.

The next repository must enforce a single transaction for member/config/ledger writes, actor/key replay lookup before stale checks, locking and canonical uniqueness across existing aliases, numbering, strict-mode server zero defaults and authenticated attribution. Initial config inserts must use exact savings types and explicit required defaults. It must verify the 64-hex server HMAC against the locked member before planning, write only actual changed fields, derive users identity from that member, and validate users email/NIK/(ktp,phone) uniqueness. The verified mirror subset is only ktp→ktp, nama_kar→name, no_telp→phone, email→email, alamat_tinggal→street_address; no users account creation, bank/group/location or wallet update belongs to profile.

Repository atomicity, rollback, competing canonical registrations, numbering races, real stale updates, unique mirror conflicts, legacy writer fences, least-privilege grants and ownership were implemented and proven on the synthetic stack by T04 (see MEMBER_WRITE_REPOSITORY.md); the ledger command name is `member.update_profile` database acceptance. Application mock ports only verify delegation, fingerprint/audit behavior and propagation of repository errors; they do not establish these guarantees. HTTP/auth/CSRF adapters, UI/rendered acceptance, explicit status/limits/deduction commands, file/QR flows, removal, mobile/TOKO integration and production activation remain subsequent work. No SQL, production config, ownership map, UOW or runtime was changed in T03.
