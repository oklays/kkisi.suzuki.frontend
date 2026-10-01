import test from 'node:test';
import { MemorySessionStore } from './helpers/auth-fakes.mjs';
import { sessionContract } from './helpers/session-store-contract.mjs';

// The fake must satisfy exactly the contract the real store is held to (tests/auth-store-db.test.mjs).
for (const [name, fn] of Object.entries(sessionContract)) {
  test(`in-memory session store contract: ${name}`, async (t) => {
    const make = async () => { const s = new MemorySessionStore(); s.countForUser = async (u) => [...s.rows.values()].filter((r) => r.userId === u).length; return s; };
    await fn(t, { make });
  });
}
