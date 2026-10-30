# Running manual UAT environments

Date: 30 October 2026. **Both dedicated servers are left running. Complete database replication remains pending; `kkisi_staging` is unchanged.**

| Environment | Browser URL | Data / allowed effects |
|---|---|---|
| Native master write UAT | `http://127.0.0.1:3230/login` | `kkisi_kfa_synthetic` on separate Docker `kkisi-kosipa-fa01`, loopback :3322. Synthetic rows; five master commands only |
| Existing staging read UAT | `http://localhost:3231/login` | `kkisi_kosipa_read_uat` SELECT-only overlay over existing `kkisi_staging` on `kkisi-staging`, loopback :3307. Real-data read access with synthetic logins; no business writes |
| New snapshot candidate | No UAT browser connected | `kkisi_refresh_20261030` on :3307; data/view validation only, missing 10 procedures, not activated |

The read overlay copies only nine **synthetic identity/permission tables** from the existing FA fixture. All other objects are views of `kkisi_staging`; 24 credential-bearing view columns return NULL. Four read-menu fixtures grant the existing savings/loan/payroll/store-credit view capabilities. Production authentication material is never used for login. The two read-only store accounts can mutate only their own new local auth/console stores; the business reader has SELECT only and no routine EXECUTE. Live DML refusal was checked on both the baseline and overlay.

The raw business records in the read console are **not anonymized**. Its banner says `DATA SALINAN PRODUKSI — HANYA BACA` and explicitly notes that the complete refresh awaits procedure export. Do not screenshot/copy personal data into tickets. The write console retains its synthetic banner. Use different browser contexts for roles and the documented `127.0.0.1` versus `localhost` hosts to keep the two consoles' cookies apart.

## Accounts and initial grant

See [UAT_TEST_ACCOUNTS](UAT_TEST_ACCOUNTS.md). The write operator `synth_kfa_operator` was given an active `kosipa.master.manage` grant through the normal authenticated/CSRF APIs: Administrator A requested and Administrator B approved. No grant bypass or direct grant-row insertion was used. Viewer remains without write access. A/B can revoke and repeat the two-person flow. Administrators do not implicitly bypass command grants.

Read UAT uses separate `kkisi_kosipa_read_auth` and `kkisi_kosipa_read_console` schemas/accounts on :3307. Write UAT retains its existing auth/console stores and separate `kkisi_kfa_ledger` on :3322. Do not merge these accounts or point a writer at `kkisi_staging`.

## Pages

- `/console/kosipa/master` and `/console/kosipa/master/{lokasi,bagian,jenis-dokumen,rekening-bank,periode-angsuran}`.
- Write grant management: `/console/settings/akses-kosipa` on :3230 only.
- Read console: `/console/kosipa/anggota`, `/simpanan`, `/pinjaman`, `/payroll`, `/laporan` beneath `/console/kosipa`.
- No member mutation, KOSIPA financial posting, document command, outbound notification/payment integration, external payroll or production synchronization is enabled.

The launcher creates a clean environment, masks repository `.env`/`.env.local` keys, validates the read profile's exact local database targets and rejects write flags/writer DSNs for that profile. Credentials are in ignored mode-600 environment/config files; never source `.env.local` as a shortcut. The existing :3000 dev server and separate public-savings server were retained. Those existing processes and their pre-existing writer settings are **outside this UAT environment**; do not use them to mutate real staging data.

## Status, start and safe shutdown

From the repository root:

```bash
node integration/kosipa-full-access/app-server.mjs status
node integration/kosipa-full-access/app-server.mjs status --profile uatread
# Start only if stopped; the launcher refuses an occupied port.
node integration/kosipa-full-access/app-server.mjs start
node integration/kosipa-full-access/app-server.mjs start --profile uatread
# Stop only these recorded dedicated servers; keep databases/volumes intact.
node integration/kosipa-full-access/app-server.mjs stop
node integration/kosipa-full-access/app-server.mjs stop --profile uatread
```

Both profiles use the reviewed `.next-kfa01` build, with distinct runtime environments. Stop **both** before rebuilding that shared build directory, then run `node integration/kosipa-full-access/app-server.mjs build` and restart both. Never rebuild `.next` or kill an unrelated dev process for this task.

## Fixture reset (synthetic write database only)

Use only when deliberately discarding synthetic test rows, sessions, grants and ledger evidence. First save any desired evidence and stop :3230. This does not reset the real-data baseline or read overlay:

```bash
node integration/kosipa-full-access/app-server.mjs stop
node integration/kosipa-full-access/local-stack.mjs reset
node integration/kosipa-full-access/app-server.mjs start
```

Re-request/approve the operator grant afterward. Retrieve the current credentials from the documented ignored file. Do not run `setup-staging.sh --reset`, delete a Docker volume, or drop/overwrite `kkisi_staging`. No fixture reset was performed during this preparation.

Read-overlay creation is in `integration/kosipa-full-access/manual-uat-read.mjs`. It refuses an existing overlay by default; `--resume` is for completing its known local setup, not a reset. Do not point it at arbitrary databases or use it to promote an incomplete candidate. Rebuilding the read overlay after a complete refresh requires stopping its server, preserving its auth/audit evidence, and a reviewed local-only recreation of the three overlay/store schemas. It never requires deleting raw business objects.
