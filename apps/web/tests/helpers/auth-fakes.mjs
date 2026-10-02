// Fakes and builders for the auth tests. Synthetic users/hashes only (bcryptjs cost 4, generated at runtime).
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { StoreUnavailableError, VerifierBusyError } from '../../src/domain/auth/errors.ts';
import { DUMMY_HASH } from '../../src/domain/auth/password-candidates.ts';
import { isSessionValid, MAX_ACTIVE_SESSIONS, MAX_ROWS_PER_USER } from '../../src/domain/auth/session.ts';
import { LOCK_CLOCK_SLACK_MS, LOCK_MS } from '../../src/domain/auth/throttle-policy.ts';
import { loadAuthConfig } from '../../src/infrastructure/auth/config.ts';
import { buildKeys } from '../../src/infrastructure/auth/keys.ts';

export const ORIGIN = 'http://127.0.0.1:3000';
export const SECRET_B64 = randomBytes(48).toString('base64');
export const ENV = {
  APP_ORIGIN: ORIGIN,
  AUTH_SECRETS: `k1:${SECRET_B64}`,
  DATABASE_URL: 'mysql://kkisi_read:pw@127.0.0.1:3307/kkisi_staging',
  DATABASE_URL_AUTH: 'mysql://kkisi_auth:pw@127.0.0.1:3307/kkisi_auth_staging',
};

export class FakeClock {
  constructor(iso = '2026-10-01T05:00:00Z') { this.t = new Date(iso).getTime(); }
  now() { return new Date(this.t); }
  advance(ms) { this.t += ms; }
}

/** $2y$ hash like the legacy PHP ones (bcryptjs emits $2b$; the prefix is relabelled). Cost 4 keeps tests fast. */
export function legacyStyleHash(plain, cost = 4) { return '$2y$' + bcrypt.hashSync(plain, cost).slice(4); }

const hex = (b) => Buffer.from(b).toString('hex');

export class MemorySessionStore {
  constructor() { this.rows = new Map(); this.down = false; this.calls = []; }
  _ok(name) { this.calls.push(name); if (this.down) throw new StoreUnavailableError(); }
  async create(s) {
    this._ok('create');
    this.rows.set(hex(s.sidHash), { sidHash: s.sidHash, userId: s.userId, companyId: s.companyId, pwf: s.pwf, createdAt: s.now, lastSeenAt: s.now,
      idleExpiresAt: s.idleExpiresAt, absExpiresAt: s.absExpiresAt, revokedAt: null, revokedReason: null, purgeAfter: s.purgeAfter });
    const mine = [...this.rows.values()].filter((r) => r.userId === s.userId);
    const valid = mine.filter((r) => isSessionValid(r, s.now)).sort((a, b) => b.lastSeenAt - a.lastSeenAt || b.createdAt - a.createdAt);
    for (const r of valid.slice(MAX_ACTIVE_SESSIONS)) { r.revokedAt = s.now; r.revokedReason = 'superseded'; }
    const all = [...this.rows.values()].filter((r) => r.userId === s.userId);
    const rank = (r) => (isSessionValid(r, s.now) ? 1 : 0);
    const keep = new Set(all.sort((a, b) => rank(b) - rank(a) || b.createdAt - a.createdAt).slice(0, MAX_ROWS_PER_USER).map((r) => hex(r.sidHash)));
    for (const r of all) if (!isSessionValid(r, s.now) && !keep.has(hex(r.sidHash))) this.rows.delete(hex(r.sidHash));
  }
  async find(h) { this._ok('find'); const r = this.rows.get(hex(h)); return r ? { ...r } : null; }
  async touch(h, now, idle, olderThan) { this._ok('touch'); const r = this.rows.get(hex(h)); if (!r || r.revokedAt || r.lastSeenAt > olderThan) return false; r.lastSeenAt = now; r.idleExpiresAt = idle; return true; }
  async revoke(h, reason, now) { this._ok('revoke'); const r = this.rows.get(hex(h)); if (!r || r.revokedAt) return false; r.revokedAt = now; r.revokedReason = reason; return true; }
  async revokeAllForUser(u, reason, now) { this._ok('revokeAll'); let n = 0; for (const r of this.rows.values()) if (r.userId === u && !r.revokedAt) { r.revokedAt = now; r.revokedReason = reason; n++; } return n; }
  async setCompany(h, c) { this._ok('setCompany'); const r = this.rows.get(hex(h)); if (!r || r.revokedAt) return false; r.companyId = c; return true; }
  async purge(now, limit) { this._ok('purge'); let n = 0; for (const [k, r] of this.rows) if (r.purgeAfter < now && n < limit) { this.rows.delete(k); n++; } return n; }
}

export class MemoryThrottleStore {
  constructor() { this.rows = new Map(); this.down = false; }
  _ok() { if (this.down) throw new StoreUnavailableError(); }
  async activeLocks(keys, now) {
    this._ok(); const cap = new Date(now.getTime() + LOCK_MS + LOCK_CLOCK_SLACK_MS); const out = [];
    for (const k of keys) { const r = this.rows.get(hex(k.keyHash)); if (!r || !r.lockedUntil || r.lockedUntil <= now) continue;
      if (r.lockedUntil > cap) { r.lockedUntil = null; continue; } out.push({ kind: r.kind, lockedUntil: r.lockedUntil }); }
    return out;
  }
  async recordFailure({ key, limit, now, windowMs, lockMs, purgeAfter }) {
    this._ok(); const id = hex(key.keyHash);
    if (!this.rows.has(id)) this.rows.set(id, { kind: key.kind, failures: 0, first: now, last: now, lockedUntil: null, purgeAfter });
    const r = this.rows.get(id); const fresh = r.first < new Date(now.getTime() - windowMs);
    r.failures = fresh ? 1 : r.failures + 1; if (r.failures >= limit) r.lockedUntil = new Date(now.getTime() + lockMs);
    if (fresh) r.first = now; r.last = now; r.purgeAfter = purgeAfter;
  }
  async clear(keys) { this._ok(); for (const k of keys) this.rows.delete(hex(k.keyHash)); }
  async purge(now, limit) { this._ok(); let n = 0; for (const [k, r] of this.rows) if (r.purgeAfter < now && n < limit) { this.rows.delete(k); n++; } return n; }
}

export class CountingVerifier {
  constructor() { this.calls = 0; this.busy = false; }
  async verify(password, hash) {
    this.calls++;
    if (this.busy) throw new VerifierBusyError();
    if (hash === DUMMY_HASH) return false;                 // same call count, no CPU
    return bcrypt.compare(password, hash);
  }
}

/** Builds real handlers/use cases over in-memory fakes. `users` etc. are plain, mutable test data. */
export function makeWorld(options = {}) {
  const clock = new FakeClock();
  const config = loadAuthConfig({ ...ENV, ...(options.env ?? {}) });
  const keys = buildKeys(config.secrets);
  const logs = [];
  const sessions = new MemorySessionStore();
  const throttle = new MemoryThrottleStore();
  const verifier = new CountingVerifier();
  const data = {
    users: new Map(), companies: new Map([[1, 'BRANCH ONE'], [2, 'BRANCH TWO'], [3, 'BRANCH THREE']]), inactiveCompanies: new Set(),
    permissions: new Set(['1:sales_add', '2:sales_add', '3:sales_add', '4:sales_add', '4:master_kasir']),
    registers: [], kasir: [{ id: 1, companyId: 1, noKasir: 'KRS01' }], failing: new Set(),
  };
  const fail = (what) => { if (data.failing.has(what)) throw new StoreUnavailableError(); };
  const view = (u) => u && ({ ...u, companyStatus: data.companies.has(u.companyId) && !data.inactiveCompanies.has(u.companyId) ? 1 : 0 });
  const deps = {
    clock, random: { bytes: (n) => randomBytes(n) }, log: (event, fields = {}) => logs.push({ event, ...fields }),
    users: {
      async findByUsername(name) { fail('users'); return view([...data.users.values()].find((u) => u.username.toLowerCase() === name.toLowerCase())) ?? null; },
      async findById(id) { fail('users'); return view(data.users.get(id)) ?? null; },
    },
    permissions: { async has(roleId, slug) { fail('permissions'); return data.permissions.has(`${roleId}:${slug}`); } },
    companies: {
      async findActive(id) { fail('companies'); return data.companies.has(id) && !data.inactiveCompanies.has(id) ? { id, name: data.companies.get(id) } : null; },
      async listActive() { fail('companies'); return [...data.companies].filter(([id]) => !data.inactiveCompanies.has(id)).map(([id, name]) => ({ id, name })); },
    },
    registers: {
      async findOpen(userId, companyId) { fail('registers'); const open = data.registers.filter((r) => r.userId === userId && r.companyId === companyId && r.status === 1);
        return { register: open[0] ? { id: open[0].id, noref: open[0].noref, idKasir: 1, noKasir: 'KRS01', openedOn: '2026-10-01', stale: !!open[0].stale } : null, openCount: open.length }; },
      async hasOpenOutside(userId, companyId) { fail('registers'); return data.registers.some((r) => r.userId === userId && r.status === 1 && r.companyId !== companyId); },
      async listKasir(companyId) { fail('registers'); return data.kasir.filter((k) => k.companyId === companyId).map((k) => ({ id: k.id, noKasir: k.noKasir })); },
    },
    sessions, throttle, verifier, throttleKeys: (u, ip) => keys.throttleKeys(u, ip),
  };
  const addUser = (o) => { const u = { id: 1, username: 'kasir', fullName: 'Kasir Sintetis', roleId: 4, companyId: 1, status: 1, roleStatus: 1, passwordHash: legacyStyleHash('Pw-Synthetic-1'), ...o }; data.users.set(u.id, u); return u; };
  return { services: { deps, config, keys }, clock, sessions, throttle, verifier, data, logs, addUser, keys, config };
}

export function makeRequest(path, o = {}) {
  const headers = new Headers();
  if (o.cookie) headers.set('cookie', o.cookie);
  if (o.origin !== null && (o.origin ?? true)) headers.set('origin', o.origin && o.origin !== true ? o.origin : ORIGIN);
  if (o.token) headers.set('x-csrf-token', o.token);
  const method = o.method ?? 'GET';
  if (method !== 'GET' && o.contentType !== null) headers.set('content-type', o.contentType ?? 'application/json');
  for (const [k, v] of Object.entries(o.headers ?? {})) headers.set(k, v);
  const body = method === 'GET' ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body ?? {});
  return new Request(`${ORIGIN}${path}`, { method, headers, body });
}

export const cookieOf = (response) => (response.headers.get('set-cookie') ?? '').split(';')[0];
export async function bodyOf(response) { return JSON.parse(await response.text()); }
