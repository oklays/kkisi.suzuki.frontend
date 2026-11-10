import { Worker } from 'node:worker_threads';
import type { PasswordVerifier } from './types.ts';

// bcrypt (Laravel `$2y$` hashes) blocks a thread ~100 ms per check, so it runs in worker threads with a bounded queue — the same
// design as the console (apps/web/src/infrastructure/auth/password-verifier.ts), kept separate because the apps deploy separately.
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
let bcrypt; try { bcrypt = require('bcryptjs'); } catch { bcrypt = null; }
parentPort.on('message', (job) => {
  if (!bcrypt) { parentPort.postMessage({ id: job.id, error: true }); return; }
  bcrypt.compare(job.password, job.hash).then((ok) => parentPort.postMessage({ id: job.id, ok }), () => parentPort.postMessage({ id: job.id, ok: false }));
});`;

export class VerifierBusyError extends Error { constructor() { super('VERIFIER_BUSY'); } }

type Job = { id: number; password: string; hash: string; resolve(ok: boolean): void; reject(e: Error): void; timer?: NodeJS.Timeout };
type Slot = { worker: Worker | null; job: Job | null };

export class WorkerPasswordVerifier implements PasswordVerifier {
  private readonly slots: Slot[];
  private readonly queue: Job[] = [];
  private nextId = 1;
  private readonly maxQueue: number;
  private readonly timeoutMs: number;

  constructor(opts: { workers?: number; maxQueue?: number; timeoutMs?: number } = {}) {
    this.slots = Array.from({ length: opts.workers ?? 2 }, () => ({ worker: null, job: null }));
    this.maxQueue = opts.maxQueue ?? 8;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  verify(password: string, hash: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const job: Job = { id: this.nextId++, password, hash, resolve, reject };
      const free = this.slots.find((s) => s.job === null);
      if (free) this.run(free, job);
      else if (this.queue.length >= this.maxQueue) reject(new VerifierBusyError());
      else this.queue.push(job);
    });
  }

  /** Stops the worker threads (tests and graceful shutdown). Pending checks fail with VerifierBusyError. */
  async close(): Promise<void> {
    await Promise.all(this.slots.map(async (slot) => { const w = slot.worker; slot.worker = null; await w?.terminate(); }));
  }

  private spawn(slot: Slot): Worker {
    const worker = new Worker(WORKER_SOURCE, { eval: true });
    worker.unref();
    worker.on('message', (msg: { id: number; ok?: boolean; error?: boolean }) => {
      const job = slot.job;
      if (!job || job.id !== msg.id) return;
      this.finish(slot, () => (msg.error ? job.reject(new VerifierBusyError()) : job.resolve(msg.ok === true)));
    });
    const dead = () => {
      if (slot.worker !== worker) return;
      slot.worker = null;
      const job = slot.job;
      if (job) this.finish(slot, () => job.reject(new VerifierBusyError()));
    };
    worker.on('error', dead);
    worker.on('exit', dead);
    return worker;
  }

  private run(slot: Slot, job: Job) {
    slot.job = job;
    slot.worker ??= this.spawn(slot);
    job.timer = setTimeout(() => {
      const w = slot.worker; slot.worker = null;
      void w?.terminate();
      this.finish(slot, () => job.reject(new VerifierBusyError()));
    }, this.timeoutMs);
    slot.worker.postMessage({ id: job.id, password: job.password, hash: job.hash });
  }

  private finish(slot: Slot, settle: () => void) {
    if (slot.job?.timer) clearTimeout(slot.job.timer);
    slot.job = null;
    settle();
    const next = this.queue.shift();
    if (next) this.run(slot, next);
  }
}
