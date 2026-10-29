/** Opt-in LOCAL_SYNTHETIC evidence: isolated MariaDB fixture, real crypto/storage and local capture delivery. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const enabled = process.env.PSS_INTEGRATION === '1';
const codeMatches = (pattern) => (error) => typeof error.code === 'string' && pattern.test(error.code);

async function fixture(t, serviceOptions = {}) {
  const { loadConfig, connect } = await import('../../../integration/public-savings/staging.mjs');
  const { createPublicSavingsService } = await import('../src/infrastructure/public-savings/service.ts');
  const { readLocalCaptures, createLocalCaptureProvider } = await import('../src/infrastructure/public-savings/providers.ts');
  const config = await loadConfig();
  assert.equal(config.mode, 'LOCAL_SYNTHETIC'); assert.equal(config.database, 'kkisi_public_savings');
  const admin = await connect('admin');
  const legacy = await connect('legacy');
  const service = createPublicSavingsService(config, typeof serviceOptions === 'function' ? serviceOptions(config, createLocalCaptureProvider) : serviceOptions);
  function newService(options = {}) { const another = createPublicSavingsService(config, options); t.after(() => another.close()); return another; }
  t.after(async () => { await service.close(); await legacy.end(); await admin.end(); });
  const id = randomInt(90_000_000, 99_999_999);
  const nik = `E${id}`;
  const name = `PSS SYNTHETIC ${id}`;
  const email = `pss-${id}@example.invalid`;
  await admin.execute("INSERT INTO m_bagian(id,name_bagian,status,id_lokasi) VALUES(?,'SYNTHETIC TEST SECTION',1,1)", [id]);
  await admin.execute("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,no_telp,email,status_anggota,status_karyawan,sim_sukarela,kd_group) VALUES(?,?,?,?,NULL,?,'AKTIVE','AKTIVE',100000,'SYNTH')", [id, nik, name, id, email]);
  await admin.execute('INSERT INTO pss_member_control(member_id,active_reference) VALUES(?,NULL)', [id]);
  await admin.execute("INSERT INTO pss_member_evidence(member_id,contact_version,contact_verified_ms,eligible,payroll_active,branch,deduction_evidence) VALUES(?,'synthetic-contact-v1',?,1,1,'SYNTHETIC BRANCH','CONFIG_VERIFIED')", [id, Date.now() - 86_400_000]);
  await admin.execute("INSERT INTO m_simpanan_aktif(jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES('SIMPANAN SUKARELA',?,?,'SYNTH',100000,100000,1,1)", [nik, name]);
  const [periods] = await admin.query("SELECT year,month FROM pss_calendar WHERE status='OPEN' AND locked=0 ORDER BY year,month");
  assert.ok(periods.length > 0, 'run local staging setup/seed first');
  const signature = await inkPng();
  async function authorize(memberRef = String(id), destination = email, usingService = service) {
    const link = await usingService.issueLink(memberRef);
    const token = new URLSearchParams(new URL(link.url, 'http://127.0.0.1').hash.slice(1)).get('token');
    assert.ok(token && token.length >= 43);
    assert.equal(new URL(link.url, 'http://127.0.0.1').searchParams.has('token'), false, 'bearer must stay in the fragment');
    const masked = await usingService.validate(token);
    assert.equal(JSON.stringify(masked).includes(nik), false, 'unverified link cannot expose full NIK');
    assert.equal(JSON.stringify(masked).includes(name), false, 'unverified link cannot expose member name');
    const challenge = await usingService.requestChallenge(token);
    const captures = await readLocalCaptures(config);
    const otp = captures.find((capture) => capture.kind === 'OTP' && capture.destination === destination && capture.id === challenge.challengeRef);
    assert.ok(otp, 'synthetic OTP is captured locally');
    assert.match(otp.code, /^[0-9]{6}$/u);
    const verified = await usingService.verifyChallenge(token, challenge.challengeRef, otp.code);
    assert.ok(verified.proof);
    const reviewed = await usingService.validate(token, verified.proof);
    const form = reviewed.form ?? reviewed;
    assert.ok(form.sectionId); assert.ok(form.consentVersion); assert.ok(form.formVersion); assert.ok(form.requestedPeriod);
    const command = { amountRupiah: '150000', sectionId: form.sectionId, startMonth: String(form.requestedPeriod.month), startYear: String(form.requestedPeriod.year), consentVersion: form.consentVersion, formVersion: form.formVersion, reviewFingerprint:form.reviewFingerprint, consent: true, signature, idempotencyKey: randomUUID() };
    return { token, proof: verified.proof, link, challenge, otp, form, command };
  }
  return { admin, legacy, service, newService, config, readLocalCaptures, id, nik, name, email, signature, authorize };
}

async function inkPng() {
  const width = 600, height = 180, raw = Buffer.alloc(width * height * 4, 255);
  for (let x = 25; x < 470; x++) for (let d = 0; d < 3; d++) {
    const i = ((Math.round(height / 2 + Math.sin(x / 21) * 20) + d) * width + x) * 4;
    raw[i] = 15; raw[i + 1] = 25; raw[i + 2] = 45;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function count(db, table, memberId, nik) {
  const [rows] = await db.execute(`SELECT COUNT(*) AS count FROM ${table} WHERE ${table === 'trans_simpanan_pengajuan' ? 'nik_kar' : 'member_id'}=?`, [table === 'trans_simpanan_pengajuan' ? nik : memberId]);
  return Number(rows[0].count);
}

async function pdfText(bytes, t) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'pss-service-pdf-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'synthetic.pdf'); await writeFile(file, bytes);
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
}

test('verified intake writes one OPEN legacy header, immutable encrypted evidence and a reproducible private PDF', { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  const auth = await f.authorize();
  await assert.rejects(() => f.service.receipt(auth.token, ''), codeMatches(/VERIFICATION|PROOF/u));
  await assert.rejects(() => f.service.pdf(auth.token, ''), codeMatches(/VERIFICATION|PROOF/u));
  const result = await f.service.submit(auth.token, auth.proof, auth.command);
  assert.match(result.reference, /^PSS[0-9a-f]{32}00000$/u);
  const [headers] = await f.admin.execute('SELECT * FROM trans_simpanan_pengajuan WHERE doc_no=?', [result.reference]);
  assert.equal(headers.length, 1);
  const h = headers[0];
  assert.equal(h.doc_status, 'OPEN'); assert.equal(h.jenis_simpanan, 'SIMPANAN SUKARELA'); assert.equal(h.is_mobile, 0);
  assert.equal(String(h.potongan_old), '100000'); assert.equal(String(h.potongan), '150000'); assert.equal(h.nik_kar, f.nik);
  assert.equal(h.awal_potong_bulan, auth.command.startMonth.padStart(2, '0')); assert.equal(h.awal_potong_tahun, auth.command.startYear);
  assert.match(h.ttd, /^pss-signature-[0-9a-f]{32}$/u);
  const [members] = await f.admin.execute('SELECT sim_sukarela FROM m_anggota WHERE id=?', [f.id]);
  assert.equal(String(members[0].sim_sukarela), '100000');
  const [masters] = await f.admin.execute("SELECT potongan_payroll FROM m_simpanan_aktif WHERE nik_kar=? AND jenis_simpanan='SIMPANAN SUKARELA'", [f.nik]);
  assert.equal(String(masters[0].potongan_payroll), '100000', 'public intake cannot execute payroll');
  const [before] = await f.admin.execute('SELECT * FROM pss_application WHERE reference=?', [result.reference]);
  assert.equal(before.length, 1); assert.equal(before[0].snapshot_cipher.includes(f.name), false); assert.equal(before[0].snapshot_cipher.includes(f.nik), false);
  const immutableCipher = before[0].snapshot_cipher;
  await assert.rejects(() => f.admin.execute("UPDATE pss_application SET snapshot_cipher='tampered' WHERE reference=?", [result.reference]), /IMMUTABLE_SUBMISSION/u);
  await f.admin.execute("UPDATE m_anggota SET nama_kar='MUTATED CURRENT MEMBER',sim_sukarela=170000 WHERE id=?", [f.id]);
  await f.service.processOutbox();
  const receipt = await f.service.receipt(auth.token, auth.proof);
  assert.equal(receipt.reference, result.reference); assert.equal(receipt.artifactState, 'READY');
  const pdf = await f.service.pdf(auth.token, auth.proof);
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
  const text = await pdfText(pdf, t);
  for (const expected of [f.name, '100000', '150000', 'PENGAJUAN', 'BELUM DISETUJUI']) assert.ok(text.includes(expected), expected);
  assert.equal(text.includes('MUTATED CURRENT MEMBER'), false, 'render uses the submitted member display snapshot');
  assert.equal(text.includes('170000'), false, 'render uses the submitted old deduction');
  await f.service.processOutbox();
  assert.deepEqual(await f.service.pdf(auth.token, auth.proof), pdf);
  const [after] = await f.admin.execute('SELECT snapshot_cipher,pdf_ref,pdf_digest,proof_status FROM pss_application WHERE reference=?', [result.reference]);
  assert.equal(after[0].snapshot_cipher, immutableCipher); assert.equal(after[0].proof_status, 'READY'); assert.match(after[0].pdf_digest, /^[a-f0-9]{64}$/u);
  await assert.rejects(() => f.admin.execute("UPDATE pss_application SET pdf_digest=REPEAT('0',64) WHERE reference=?", [result.reference]), /IMMUTABLE_READY_PROOF/u);
  const captures = await f.readLocalCaptures(f.config);
  assert.equal(captures.filter((value) => value.kind === 'SUBMISSION_CONFIRMATION' && value.reference === result.reference && value.destination === 'operations@example.invalid').length, 1);
  assert.equal(captures.filter((value) => value.kind === 'SUBMISSION_CONFIRMATION' && value.reference === result.reference && value.destination === f.email).length, 1, 'member confirmation happens only after durable commit');
  await f.legacy.execute('CALL pss_legacy_transition(?,?,?)', [result.reference, 'APPROVE', 'SYNTHETIC_CHECKER']);
  assert.deepEqual(await f.service.pdf(auth.token, auth.proof), pdf, 'historical reprint is byte-identical after a controlled legacy approval');
});

test('identical idempotency replay returns the original receipt; changed payload never adds a second application', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const first = await f.service.submit(auth.token, auth.proof, auth.command);
  const replay = await f.service.submit(auth.token, auth.proof, { ...auth.command, signature: Buffer.from(auth.command.signature) });
  assert.equal(replay.reference, first.reference);
  await assert.rejects(() => f.service.submit(auth.token, auth.proof, { ...auth.command, amountRupiah: '160000' }), codeMatches(/IDEMPOTENCY/u));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 1);
  assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 1);
});

test('invalid consent, signature, version, amount and forged form fields roll back all submission writes', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const bad = [
    [{ consent: false }, /CONSENT|INVALID/u], [{ signature: Buffer.from('<svg/>') }, /SIGNATURE/u],
    [{ consentVersion: 'forged-version' }, /FORM|VERSION/u], [{ formVersion: 'forged-version' }, /FORM|VERSION/u],
    [{ sectionId: 'forged-section' }, /FORM|SECTION/u], [{ startMonth: '13' }, /PERIOD|FORM|INVALID/u],
    [{ amountRupiah: '0' }, /AMOUNT|ZERO|STAFF|ASSISTED/u], [{ amountRupiah: '150000.1' }, /AMOUNT|INVALID/u],
    [{ amountRupiah: '5001000' }, /AMOUNT|MAX/u], [{ amountRupiah: '150001' }, /AMOUNT|INCREMENT/u],
  ];
  for (const [fields, pattern] of bad) await assert.rejects(() => f.service.submit(auth.token, auth.proof, { ...auth.command, ...fields, idempotencyKey: randomUUID() }), codeMatches(pattern));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
  assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 0);
  const [locks] = await f.admin.execute('SELECT active_reference FROM pss_member_control WHERE member_id=?', [f.id]); assert.equal(locks[0].active_reference, null);
  const [links] = await f.admin.execute('SELECT state FROM pss_link WHERE id=?', [auth.link.linkRef]); assert.equal(links[0].state, 'ACTIVE');
});

test('contact-version and reviewed current-deduction drift invalidate submission under the final lock', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  await f.admin.execute("UPDATE pss_member_evidence SET contact_version='synthetic-contact-v2' WHERE member_id=?", [f.id]);
  await assert.rejects(() => f.service.submit(auth.token, auth.proof, auth.command), codeMatches(/VERIFICATION|CONTACT|PROOF/u));
  await f.admin.execute("UPDATE pss_member_evidence SET contact_version='synthetic-contact-v1' WHERE member_id=?", [f.id]);
  await f.admin.execute('UPDATE m_anggota SET sim_sukarela=120000 WHERE id=?', [f.id]);
  await assert.rejects(() => f.service.submit(auth.token, auth.proof, auth.command), codeMatches(/FORM_CHANGED|ASSISTED_REQUIRED/u));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
});

test('proofs bind to one link; OTP replay/resend/failed-attempt limits persist in the database', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  await assert.rejects(() => f.service.verifyChallenge(auth.token, auth.challenge.challengeRef, auth.otp.code), codeMatches(/USED|CHALLENGE/u));
  await assert.rejects(() => f.service.requestChallenge(auth.token), codeMatches(/RESEND|RATE|TOO_SOON/u));
  const other = await f.service.issueLink(String(f.id));
  const otherToken = new URLSearchParams(new URL(other.url, 'http://127.0.0.1').hash.slice(1)).get('token');
  await assert.rejects(() => f.service.submit(otherToken, auth.proof, auth.command), codeMatches(/VERIFICATION|PROOF/u));
  // Age only synthetic resend timestamps; no wall-clock sleeps or external delivery.
  await f.admin.execute('UPDATE pss_challenge SET created_ms=created_ms-61000 WHERE link_id=?', [other.linkRef]);
  await f.admin.execute('UPDATE pss_challenge SET created_ms=created_ms-61000 WHERE link_id=?', [auth.link.linkRef]);
  const challenge = await f.service.requestChallenge(otherToken);
  const actual = (await f.readLocalCaptures(f.config)).filter((capture) => capture.kind === 'OTP' && capture.destination === f.email).sort((a, b) => b.expiresAt - a.expiresAt)[0];
  assert.ok(actual?.code);
  const wrongCode = actual.code === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(() => f.service.verifyChallenge(otherToken, challenge.challengeRef, wrongCode), codeMatches(/CODE|CHALLENGE|OTP/u));
  const [links] = await f.admin.execute('SELECT failed_attempts FROM pss_link WHERE id=?', [other.linkRef]); assert.equal(Number(links[0].failed_attempts), 5);
  await assert.rejects(() => f.service.verifyChallenge(otherToken, challenge.challengeRef, actual.code), codeMatches(/LOCKED|CHALLENGE/u));
});

test('revoked and expired links cannot submit or obtain fresh verification challenges', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  await f.service.revokeLink(auth.link.linkRef, 'SYNTHETIC TEST REVOCATION');
  await assert.rejects(() => f.service.submit(auth.token, auth.proof, auth.command), codeMatches(/REVOKED|LINK/u));
  await assert.rejects(() => f.service.requestChallenge(auth.token), codeMatches(/REVOKED|LINK/u));
  const expired = await f.service.issueLink(String(f.id));
  const token = new URLSearchParams(new URL(expired.url, 'http://127.0.0.1').hash.slice(1)).get('token');
  await f.admin.execute('UPDATE pss_link SET expires_ms=? WHERE id=?', [Date.now() - 1, expired.linkRef]);
  await assert.rejects(() => f.service.requestChallenge(token), codeMatches(/EXPIRED|LINK/u));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
});

test('concurrent public submits create one legacy header and retain one active member guard', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const attempts = await Promise.allSettled([
    f.service.submit(auth.token, auth.proof, { ...auth.command, idempotencyKey: randomUUID() }),
    f.service.submit(auth.token, auth.proof, { ...auth.command, idempotencyKey: randomUUID() }),
  ]);
  assert.equal(attempts.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 1);
  assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 1);
  const [locks] = await f.admin.execute('SELECT active_reference FROM pss_member_control WHERE member_id=?', [f.id]); assert.ok(locks[0].active_reference);
});

test('concurrent mobile/public intake shares the real database member guard with exactly one winning header', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const mobileReference = `SIMMOB${Date.now()}${randomInt(100000, 999999)}`;
  const attempts = await Promise.allSettled([
    f.service.submit(auth.token, auth.proof, auth.command),
    f.legacy.execute('CALL pss_mobile_create(?,?,?,?,?,?)', [f.id, mobileReference, 160000, Number(auth.command.startMonth), Number(auth.command.startYear), 'SYNTHETIC_MOBILE']),
  ]);
  assert.equal(attempts.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 1);
  const [headers] = await f.admin.execute('SELECT doc_no,is_mobile,doc_status FROM trans_simpanan_pengajuan WHERE nik_kar=?', [f.nik]);
  assert.equal(headers[0].doc_status, 'OPEN');
  assert.ok((headers[0].doc_no === mobileReference && headers[0].is_mobile === 1) || (/^PSS/u.test(headers[0].doc_no) && headers[0].is_mobile === 0));
});


test('OTP and proof expiry use persisted event time without extending the verification window', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const advanced = f.newService({ clock: () => Date.now() + 16 * 60_000 });
  await assert.rejects(() => advanced.submit(auth.token, auth.proof, auth.command), codeMatches(/PROOF_EXPIRED/u));
  await assert.rejects(() => advanced.pdf(auth.token, auth.proof), codeMatches(/PROOF_EXPIRED/u));
  const expiredLink = f.newService({ clock: () => Date.now() + 49 * 3_600_000 });
  assert.equal((await expiredLink.validate(auth.token)).state, 'EXPIRED');
  const replacement = await f.service.issueLink(String(f.id));
  const token = new URLSearchParams(new URL(replacement.url, 'http://127.0.0.1').hash.slice(1)).get('token');
  const challenge = await f.service.requestChallenge(token);
  const capture = (await f.readLocalCaptures(f.config)).find((value) => value.id === challenge.challengeRef);
  await f.admin.execute('UPDATE pss_challenge SET created_ms=?,expires_ms=? WHERE id=?', [Date.now() - 301_000, Date.now() - 1_000, challenge.challengeRef]);
  await assert.rejects(() => f.service.verifyChallenge(token, challenge.challengeRef, capture.code), codeMatches(/CHALLENGE_EXPIRED/u));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
});

test('failure on the final legacy header insert rolls back the application, reservation and token consumption', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const trigger = `pss_test_fail_${f.id}`;
  await f.admin.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON trans_simpanan_pengajuan FOR EACH ROW BEGIN IF NEW.nik_kar='${f.nik}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_FINAL_WRITE_FAIL'; END IF; END`);
  try {
    await assert.rejects(() => f.service.submit(auth.token, auth.proof, auth.command), codeMatches(/DEPENDENCY|COMMIT/u));
    assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
    assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 0);
    const [controls] = await f.admin.execute('SELECT active_reference FROM pss_member_control WHERE member_id=?', [f.id]); assert.equal(controls[0].active_reference, null);
    const [links] = await f.admin.execute('SELECT state,consumed_reference FROM pss_link WHERE id=?', [auth.link.linkRef]); assert.equal(links[0].state, 'ACTIVE'); assert.equal(links[0].consumed_reference, null);
    const [audit] = await f.admin.execute("SELECT COUNT(*) count FROM pss_audit WHERE member_id=? AND event='SUBMISSION_COMMITTED'", [f.id]); assert.equal(Number(audit[0].count), 0);
    assert.equal((await f.readLocalCaptures(f.config)).filter((value) => value.kind === 'SUBMISSION_CONFIRMATION' && value.destination === f.email).length, 0);
  } finally { await f.admin.query(`DROP TRIGGER ${trigger}`); }
  const retry = await f.service.submit(auth.token, auth.proof, auth.command);
  assert.ok(retry.reference, 'same retry succeeds after the synthetic failure is removed');
});

test('failed notification keeps the committed application and recovers through a healthy outbox worker', { skip: !enabled }, async (t) => {
  const f = await fixture(t, (config, captureProvider) => {
    const capture = captureProvider(config);
    return { provider: { async deliver(message) { if (message.kind === 'SUBMISSION_CONFIRMATION') throw new Error('SYNTHETIC_PROVIDER_FAILURE'); return capture.deliver(message); } } };
  });
  const auth = await f.authorize();
  const result = await f.service.submit(auth.token, auth.proof, auth.command);
  assert.equal(result.artifactState, 'READY', 'delivery failure cannot roll back PDF or accepted intake');
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 1);
  const [failed] = await f.admin.execute("SELECT kind,status,attempts FROM pss_outbox WHERE reference=? AND kind IN('NOTIFY_OPERATIONS','NOTIFY_MEMBER')", [result.reference]);
  assert.ok(failed.some((row) => row.status === 'FAILED'));
  assert.equal((await f.readLocalCaptures(f.config)).filter((value) => value.kind === 'SUBMISSION_CONFIRMATION' && value.reference === result.reference).length, 0);
  const early = f.newService(); await early.processOutbox();
  const [waiting] = await f.admin.execute("SELECT COUNT(*) count FROM pss_outbox WHERE reference=? AND status='FAILED'",[result.reference]);assert.ok(Number(waiting[0].count)>0,'failed deliveries must wait for the persisted backoff deadline');
  const healthy = f.newService({clock:()=>Date.now()+61000}); await healthy.processOutbox();
  const [pending] = await f.admin.execute("SELECT COUNT(*) count FROM pss_outbox WHERE reference=? AND status<>'SENT'", [result.reference]); assert.equal(Number(pending[0].count), 0);
  const delivered = (await f.readLocalCaptures(f.config)).filter((value) => value.kind === 'SUBMISSION_CONFIRMATION' && value.reference === result.reference);
  assert.equal(delivered.filter((value) => value.destination === f.email).length, 1);
  assert.equal(delivered.filter((value) => value.destination === 'operations@example.invalid').length, 1);
  await healthy.processOutbox();
  assert.equal((await f.readLocalCaptures(f.config)).filter((value) => value.kind === 'SUBMISSION_CONFIRMATION' && value.reference === result.reference).length, 2);
});

test('concurrent exact idempotency retries both return one original receipt', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const results = await Promise.all([f.service.submit(auth.token, auth.proof, auth.command), f.service.submit(auth.token, auth.proof, { ...auth.command, signature: Buffer.from(auth.command.signature) })]);
  assert.equal(results[0].reference, results[1].reference);
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 1);
  assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 1);
});

test('a payroll calendar change after review requires a fresh review and commits no application', { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  const year = randomInt(3100, 8999), future = Date.UTC(year, 0, 15, 3);
  await f.admin.execute("INSERT INTO pss_calendar(year,month,status,locked) VALUES(?,1,'OPEN',0)", [year]);
  try {
    await f.admin.execute('UPDATE pss_member_evidence SET contact_verified_ms=? WHERE member_id=?', [future - 86_400_000, f.id]);
    const service = f.newService({ clock: () => future });
    const auth = await f.authorize(String(f.id), f.email, service);
    assert.equal(auth.form.requestedPeriod.year, year); assert.equal(auth.form.requestedPeriod.month, 1);
    await f.admin.execute('UPDATE pss_calendar SET locked=1 WHERE year=? AND month=1', [year]);
    await assert.rejects(() => service.submit(auth.token, auth.proof, auth.command), codeMatches(/FORM_CHANGED|PERIOD/u));
    assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
  } finally { await f.admin.execute('DELETE FROM pss_calendar WHERE year=? AND month=1', [year]); }
});

test('member section and actual trusted destination changes invalidate an already reviewed submission', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  await f.admin.execute('UPDATE m_anggota SET email=? WHERE id=?', [`changed-${f.id}@example.invalid`, f.id]);
  await assert.rejects(() => f.service.submit(auth.token, auth.proof, auth.command), codeMatches(/VERIFICATION|CONTACT|PROOF/u));
  await f.admin.execute('UPDATE m_anggota SET email=? WHERE id=?', [f.email, f.id]);
  await f.admin.execute('UPDATE m_anggota SET nik_kar=? WHERE id=?',['N'+String(f.id),f.id]);
  await assert.rejects(()=>f.service.validate(auth.token,auth.proof),codeMatches(/VERIFICATION|CONTACT|PROOF/));
  await f.admin.execute('UPDATE m_anggota SET nik_kar=? WHERE id=?',[f.nik,f.id]);
  const section = f.id + 100_000_000;
  await f.admin.execute("INSERT INTO m_bagian(id,name_bagian,status,id_lokasi) VALUES(?,'SYNTHETIC CHANGED SECTION',1,1)", [section]);
  await f.admin.execute('UPDATE m_anggota SET bagian=? WHERE id=?', [section, f.id]);
  await assert.rejects(() => f.service.submit(auth.token, auth.proof, auth.command), codeMatches(/FORM_CHANGED/u));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
});


test('missing, null or disagreeing active deduction configuration cannot be treated as zero or first enrollment', { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  await f.admin.execute('DELETE FROM m_simpanan_aktif WHERE nik_kar=?', [f.nik]);
  await assert.rejects(() => f.authorize(), codeMatches(/ASSISTED_REQUIRED/u));
  await f.admin.execute("INSERT INTO m_simpanan_aktif(jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES('SIMPANAN SUKARELA',?,?,'SYNTH',100000,120000,1,1)", [f.nik, f.name]);
  await assert.rejects(() => f.authorize(), codeMatches(/ASSISTED_REQUIRED/u));
  await f.admin.execute('UPDATE m_simpanan_aktif SET potongan_payroll=100000 WHERE nik_kar=?', [f.nik]);
  await f.admin.execute('UPDATE m_anggota SET sim_sukarela=NULL WHERE id=?', [f.id]);
  await assert.rejects(() => f.authorize(), codeMatches(/ASSISTED_REQUIRED/u));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
  assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 0);
});

test('first enrollment requires explicit verified-none evidence and preserves null previous deduction', { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  await f.admin.execute('DELETE FROM m_simpanan_aktif WHERE nik_kar=?', [f.nik]);
  await f.admin.execute('UPDATE m_anggota SET sim_sukarela=NULL WHERE id=?', [f.id]);
  await f.admin.execute("UPDATE pss_member_evidence SET deduction_evidence='VERIFIED_NONE' WHERE member_id=?", [f.id]);
  const auth = await f.authorize(); assert.equal(auth.form.originalDeduction, null);
  const result = await f.service.submit(auth.token, auth.proof, auth.command);
  assert.equal(result.artifactState, 'READY');
  const [headers] = await f.admin.execute('SELECT potongan_old,potongan,doc_status FROM trans_simpanan_pengajuan WHERE doc_no=?', [result.reference]);
  assert.equal(headers[0].potongan_old, null); assert.equal(String(headers[0].potongan), '150000'); assert.equal(headers[0].doc_status, 'OPEN');
  const text = await pdfText(await f.service.pdf(auth.token, auth.proof), t);
  assert.ok(text.includes('Belum terdaftar (pendaftaran pertama)'));
});

test('operator listing quarantines one corrupted evidence record while retaining valid immutable submissions', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const good = await f.service.submit(auth.token, auth.proof, auth.command);
  const reference = `PSS${randomUUID().replaceAll('-', '')}00000`;
  await f.admin.execute("INSERT INTO pss_application(reference,member_id,link_id,idempotency_key,request_hash,payload_hash,snapshot_cipher,snapshot_hash,verified_ms,created_ms) VALUES(?,?,?,?,REPEAT('0',64),REPEAT('0',64),'SYNTHETIC_CORRUPT',REPEAT('0',64),?,?)", [reference, f.id, randomUUID().replaceAll('-', ''), randomUUID(), Date.now(), Date.now()]);
  await f.admin.execute("INSERT INTO pss_command_guard(connection_id,reference,action) VALUES(CONNECTION_ID(),?,'CREATE_MOBILE')", [reference]);
  try {
    await f.admin.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_status,jenis_simpanan,nik_kar,nama,potongan_old,potongan,status_notif,is_mobile) VALUES(?,'OPEN','SIMPANAN SUKARELA',?,?,100000,150000,0,0)", [reference, f.nik, f.name]);
  } finally { await f.admin.execute('DELETE FROM pss_command_guard WHERE connection_id=CONNECTION_ID()'); }
  const listed = await f.service.listApplications();
  const invalid = listed.applications.find((value) => value.reference === reference);
  assert.ok(listed.applications.some((value) => value.reference === good.reference), 'a valid record remains available');
  assert.ok(invalid); assert.equal(invalid.integrityState, 'INVALID'); assert.equal(invalid.status, 'ASSISTED_REQUIRED');
  for (const pii of [f.name, f.nik, f.email]) assert.equal(JSON.stringify(invalid).includes(pii), false, 'quarantine never displays unverified identity data');
  await assert.rejects(() => f.service.operatorPdf(reference), codeMatches(/SNAPSHOT|INTEGRITY|PDF_NOT_READY/u));
});


test('twenty identical requests across two independent OS processes return one receipt and commit exactly three outbox intents', { skip: !enabled }, async (t) => {
  const f = await fixture(t), auth = await f.authorize();
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'pss-two-process-race-'));
  const file = join(directory, 'private-request.json');
  try {
    const { signature, ...command } = auth.command;
    await writeFile(file, JSON.stringify({ token: auth.token, proof: auth.proof, command, signatureBase64: Buffer.from(signature).toString('base64') }), { mode: 0o600, flag: 'wx' });
    const worker = fileURLToPath(new URL('../../../integration/public-savings/submission-worker.mjs', import.meta.url));
    const run = promisify(execFile);
    const children = await Promise.all([run(process.execPath, ['--experimental-strip-types', worker, file, '10'], { maxBuffer: 64_000, timeout: 60_000 }), run(process.execPath, ['--experimental-strip-types', worker, file, '10'], { maxBuffer: 64_000, timeout: 60_000 })]);
    const results = children.flatMap((child) => JSON.parse(child.stdout));
    assert.equal(results.length, 20);
    assert.equal(results.filter((result) => result.ok).length, 20, JSON.stringify(results));
    assert.equal(new Set(results.map((result) => result.reference)).size, 1);
    const reference = results[0].reference;
    assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 1);
    assert.equal(await count(f.admin, 'trans_simpanan_pengajuan', f.id, f.nik), 1);
    const [outbox] = await f.admin.execute('SELECT kind,COUNT(*) count FROM pss_outbox WHERE reference=? GROUP BY kind', [reference]);
    assert.equal(outbox.length, 3); for (const row of outbox) assert.equal(Number(row.count), 1);
    assert.deepEqual(outbox.map((row) => row.kind).sort(), ['NOTIFY_MEMBER', 'NOTIFY_OPERATIONS', 'RENDER_PDF']);
    const [profile] = await f.admin.execute('SELECT sim_sukarela FROM m_anggota WHERE id=?', [f.id]); assert.equal(String(profile[0].sim_sukarela), '100000');
    const [master] = await f.admin.execute('SELECT potongan_payroll FROM m_simpanan_aktif WHERE nik_kar=?', [f.nik]); assert.equal(String(master[0].potongan_payroll), '100000');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('trusted-contact evidence older than 180 days requires assisted verification before issuing another link', { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  await f.admin.execute('UPDATE pss_member_evidence SET contact_verified_ms=? WHERE member_id=?', [Date.now() - 181 * 86_400_000, f.id]);
  await assert.rejects(() => f.service.issueLink(String(f.id)), codeMatches(/CONTACT_UNTRUSTED|ASSISTED_REQUIRED/u));
  assert.equal(await count(f.admin, 'pss_application', f.id, f.nik), 0);
});
test('intake OFF prevents new issuance and submissions while existing proof and historical receipts remain available', {skip:!enabled},async t=>{
 const f=await fixture(t),auth=await f.authorize();
 const paused=f.newService({intakeEnabled:()=>false});
 await assert.rejects(()=>paused.issueLink(String(f.id)),codeMatches(/ACTIVATION_BLOCKED/));
 await assert.rejects(()=>paused.submit(auth.token,auth.proof,auth.command),codeMatches(/ACTIVATION_BLOCKED/));
 const result=await f.service.submit(auth.token,auth.proof,auth.command);
 assert.equal((await paused.receipt(auth.token,auth.proof)).reference,result.reference);
 assert.equal(Buffer.from(await paused.pdf(auth.token,auth.proof)).subarray(0,5).toString(),'%PDF-');
});
test('a second form view cannot silently replace the immutable facts reviewed in another tab', {skip:!enabled},async t=>{
 const f=await fixture(t),auth=await f.authorize();
 await f.admin.execute("UPDATE m_anggota SET nama_kar='CHANGED SYNTHETIC NAME' WHERE id=?",[f.id]);
 await f.service.validate(auth.token,auth.proof);
 await assert.rejects(()=>f.service.submit(auth.token,auth.proof,auth.command),codeMatches(/FORM_CHANGED/));
 assert.equal(await count(f.admin,'pss_application',f.id,f.nik),0);
});
test('disabled authoritative savings-type reference cannot authorize an already reviewed form', {skip:!enabled},async t=>{
 const f=await fixture(t),auth=await f.authorize();
 await f.admin.execute("UPDATE m_simpanan_mobile SET status_pengajuan=0 WHERE jenis_simpanan='SIMPANAN SUKARELA'");
 try{await assert.rejects(()=>f.service.submit(auth.token,auth.proof,auth.command),codeMatches(/REFERENCE|FORM_CHANGED/));assert.equal(await count(f.admin,'pss_application',f.id,f.nik),0);}
 finally{await f.admin.execute("UPDATE m_simpanan_mobile SET status_pengajuan=1 WHERE jenis_simpanan='SIMPANAN SUKARELA'");}
});
test('legacy varchar department references never use MySQL numeric-prefix coercion', {skip:!enabled},async t=>{
 const f=await fixture(t),auth=await f.authorize();
 await f.admin.execute('UPDATE m_anggota SET bagian=? WHERE id=?',[String(f.id)+'junk',f.id]);
 await assert.rejects(()=>f.service.validate(auth.token,auth.proof),codeMatches(/MEMBER_UNAVAILABLE|FORM_REFERENCE|ASSISTED/));
 assert.equal(await count(f.admin,'pss_application',f.id,f.nik),0);
});
test('local maintenance preserves financial evidence while expiring OTP material and queues a deduplicated backup escalation', {skip:!enabled},async t=>{
 const f=await fixture(t);
 const {maintenance,queueEscalations}=await import('../../../integration/public-savings/operations.mjs');
 const start=new Date(Date.now()+14*86400000);while(start.getUTCDay()!==5)start.setUTCDate(start.getUTCDate()+1);
 const friday=start.getTime(),using=f.newService({clock:()=>friday});const auth=await f.authorize(String(f.id),f.email,using);
 const submitted=await using.submit(auth.token,auth.proof,auth.command);
 const oldChallenge=randomUUID().replaceAll('-','');await f.admin.execute("INSERT INTO pss_challenge(id,link_id,code_hash,created_ms,expires_ms,used) VALUES(?,?,REPEAT('a',64),?,?,0)",[oldChallenge,auth.link.linkRef,Date.now()-1000000,Date.now()-100]);
 await maintenance();let [challenge]=await f.admin.execute('SELECT code_hash FROM pss_challenge WHERE id=?',[oldChallenge]);assert.ok(challenge[0].code_hash,'dry run rolls back');
 await maintenance({apply:true});[challenge]=await f.admin.execute('SELECT code_hash FROM pss_challenge WHERE id=?',[oldChallenge]);assert.equal(challenge[0].code_hash,null);
 await queueEscalations(friday+4*86400000);await queueEscalations(friday+4*86400000);
 const [jobs]=await f.admin.execute("SELECT COUNT(*) count FROM pss_outbox WHERE reference=? AND kind='NOTIFY_ESCALATION'",[submitted.reference]);assert.equal(Number(jobs[0].count),1);
 await using.processOutbox();const notices=(await f.readLocalCaptures(f.config)).filter(x=>x.reference===submitted.reference&&x.destination==='operations-backup@example.invalid');assert.equal(notices.length,1);
 assert.equal(await count(f.admin,'pss_application',f.id,f.nik),1);assert.equal(await count(f.admin,'trans_simpanan_pengajuan',f.id,f.nik),1);
});
test('missing branch operations recipient fails delivery without losing intake or silently using a hardcoded fallback', {skip:!enabled},async t=>{
 const f=await fixture(t),auth=await f.authorize();
 await f.admin.execute("UPDATE pss_notification_recipient SET active=0 WHERE branch='SYNTHETIC BRANCH' AND role='OPERATIONS'");
 let submitted;
 try{submitted=await f.service.submit(auth.token,auth.proof,auth.command);const [jobs]=await f.admin.execute("SELECT status FROM pss_outbox WHERE reference=? AND kind='NOTIFY_OPERATIONS'",[submitted.reference]);assert.equal(jobs[0].status,'FAILED');assert.equal(submitted.artifactState,'READY');}
 finally{await f.admin.execute("UPDATE pss_notification_recipient SET active=1 WHERE branch='SYNTHETIC BRANCH' AND role='OPERATIONS'");}
 await f.newService({clock:()=>Date.now()+61000}).processOutbox();const [jobs]=await f.admin.execute("SELECT status FROM pss_outbox WHERE reference=? AND kind='NOTIFY_OPERATIONS'",[submitted.reference]);assert.equal(jobs[0].status,'SENT');
});
test('a real TCP-dropped COMMIT acknowledgement reports unknown outcome and exact retry recovers the committed request', {skip:!enabled},async t=>{
 const f=await fixture(t),auth=await f.authorize();
 const net=await import('node:net'),sockets=new Set();let dropped=false;
 const proxy=net.createServer(client=>{
  const upstream=net.connect({host:f.config.host,port:f.config.port});sockets.add(client);sockets.add(upstream);let financial=false,dropReply=false;
  client.on('data',bytes=>{
   const sql=bytes.subarray(5).toString('utf8');
   if(bytes[4]===0x16&&/INSERT INTO pss_application\(/.test(sql))financial=true;
   if(bytes[4]===0x03&&/^COMMIT$/i.test(sql)&&financial&&!dropped){dropReply=true;dropped=true;}
   upstream.write(bytes);
  });
  upstream.on('data',bytes=>{if(dropReply){client.destroy();upstream.destroy();}else client.write(bytes);});
  for(const socket of [client,upstream]){socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);client.destroy();upstream.destroy();});}
 });
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3330,'127.0.0.1',resolve);});
 const {createPublicSavingsService}=await import('../src/infrastructure/public-savings/service.ts');const uncertain=createPublicSavingsService({...f.config,port:3330});
 try{
  await assert.rejects(()=>uncertain.submit(auth.token,auth.proof,auth.command),codeMatches(/COMMIT_OUTCOME_UNKNOWN/));assert.equal(dropped,true);
  assert.equal(await count(f.admin,'pss_application',f.id,f.nik),1);
  const retry=await f.service.submit(auth.token,auth.proof,auth.command);
  assert.ok(retry.reference);assert.equal(await count(f.admin,'trans_simpanan_pengajuan',f.id,f.nik),1);
 }finally{await uncertain.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>proxy.close(resolve));}
});

test('resend retains failed attempts, supersedes old codes, enforces per-link cap and shares the member hourly cap across links', { skip: !enabled }, async (t) => {
  const f = await fixture(t);
  const issued = await f.service.issueLink(String(f.id));
  const tokenOf = (link) => new URLSearchParams(new URL(link.url, 'http://127.0.0.1').hash.slice(1)).get('token');
  const token = tokenOf(issued);
  const first = await f.service.requestChallenge(token);
  const original = (await f.readLocalCaptures(f.config)).find((value) => value.id === first.challengeRef);
  const wrong = original.code === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(() => f.service.verifyChallenge(token, first.challengeRef, wrong), codeMatches(/OTP_INVALID/u));
  await f.admin.execute('UPDATE pss_challenge SET created_ms=created_ms-61000 WHERE link_id=?', [issued.linkRef]);
  const second = await f.service.requestChallenge(token);
  assert.ok(second.challengeRef !== first.challengeRef);
  const [links] = await f.admin.execute('SELECT failed_attempts FROM pss_link WHERE id=?', [issued.linkRef]); assert.equal(Number(links[0].failed_attempts), 2);
  await assert.rejects(() => f.service.verifyChallenge(token, first.challengeRef, original.code), codeMatches(/CHALLENGE_SUPERSEDED/u));
  await f.admin.execute('UPDATE pss_challenge SET created_ms=created_ms-61000 WHERE link_id=?', [issued.linkRef]);
  await f.service.requestChallenge(token);
  await f.admin.execute('UPDATE pss_challenge SET created_ms=created_ms-61000 WHERE link_id=?', [issued.linkRef]);
  await assert.rejects(() => f.service.requestChallenge(token), codeMatches(/RESEND_LIMIT/u));
  for (let index = 0; index < 2; index++) { const next = await f.service.issueLink(String(f.id)); await f.service.requestChallenge(tokenOf(next)); }
  const sixth = await f.service.issueLink(String(f.id));
  await assert.rejects(() => f.service.requestChallenge(tokenOf(sixth)), codeMatches(/RESEND_LIMIT/u));
  const [sends] = await f.admin.execute('SELECT COUNT(*) count FROM pss_challenge c JOIN pss_link l ON l.id=c.link_id WHERE l.member_id=?', [f.id]); assert.equal(Number(sends[0].count), 5);
});
