import { Worker } from 'node:worker_threads';
import { VerifierBusyError } from '../../domain/auth/errors.ts';
import type { PasswordVerifier } from '../../application/auth/ports.ts';

// bcryptjs is pure JS: at cost 10 one verification blocks its thread for ~115 ms (measured in 2A-0: 4 concurrent
// verifications stall the main event loop ~420 ms). It therefore runs in worker threads. The worker source is a string
// (eval worker) so bundlers never have to trace a worker file; it resolves bcryptjs from the project's node_modules.
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch (e) { bcrypt = null; }
parentPort.on('message', (job) => {
  if (!bcrypt) { parentPort.postMessage({ id: job.id, error: true }); return; }
  bcrypt.compare(job.password, job.hash).then(
    (ok) => parentPort.postMessage({ id: job.id, ok }),
    () => parentPort.postMessage({ id: job.id, ok: false }));
});`;

type Job = { id: number; password: string; hash: string; resolve(ok: boolean): void; reject(error: Error): void; timer?: NodeJS.Timeout };
type Slot = { worker: Worker | null; job: Job | null };

export type VerifierOptions = { workers?: number; maxQueue?: number; timeoutMs?: number };

/** Bounded pool: `workers` running, at most `maxQueue` waiting, beyond that VerifierBusyError (-> 503 + Retry-After). */
export class WorkerPasswordVerifier implements PasswordVerifier {
  private readonly slots: Slot[];
  private readonly queue: Job[] = [];
  private readonly maxQueue: number;
  private readonly timeoutMs: number;
  private nextId = 1;

  constructor(options: VerifierOptions = {}) {
    this.slots = Array.from({ length: options.workers ?? 2 }, () => ({ worker: null, job: null }));
    this.maxQueue = options.maxQueue ?? 8;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  verify(password: string, hash: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const job: Job = { id: this.nextId++, password, hash, resolve, reject };
      const free = this.slots.find((s) => s.job === null);
      if (free) { this.run(free, job); return; }
      if (this.queue.length >= this.maxQueue) { reject(new VerifierBusyError()); return; }
      this.queue.push(job);
    });
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
    slot.worker = worker;
    return worker;
  }

  private run(slot: Slot, job: Job): void {
    slot.job = job;
    const worker = slot.worker ?? this.spawn(slot);
    job.timer = setTimeout(() => {
      if (slot.job !== job) return;
      const stuck = slot.worker; slot.worker = null;
      void stuck?.terminate();
      this.finish(slot, () => job.reject(new VerifierBusyError()));
    }, this.timeoutMs);
    job.timer.unref();
    worker.postMessage({ id: job.id, password: job.password, hash: job.hash });
  }

  private finish(slot: Slot, settle: () => void): void {
    const job = slot.job;
    if (job?.timer) clearTimeout(job.timer);
    slot.job = null;
    settle();
    const next = this.queue.shift();
    if (next) this.run(slot, next);
  }

  async close(): Promise<void> {
    await Promise.all(this.slots.map((s) => s.worker?.terminate()));
  }
}
