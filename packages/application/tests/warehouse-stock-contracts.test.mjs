import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { makeOutbox, makeApplier } from './helpers/stock-outbox-fakes.mjs';
import { runOutboxContract, runApplierContract } from './contracts/stock-contracts.mjs';

// The in-memory doubles must satisfy the same contracts as any real adapter, otherwise the other tests prove nothing about the adapters.
runOutboxContract({ name: 'in-memory outbox', test, make: async () => ({ outbox: makeOutbox().outbox, uniqueKeyPrefix: `mem:${randomBytes(3).toString('hex')}` }) });
runApplierContract({ name: 'in-memory applier', test, make: async () => { const a = makeApplier(); return { applier: a.applier, balanceOf: async (c, i) => a.stock.get(`${c}:${i}`) ?? 0, uniqueKeyPrefix: `mem:${randomBytes(3).toString('hex')}` }; } });
