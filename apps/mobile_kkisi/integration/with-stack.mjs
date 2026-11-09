// Runs a command with the synthetic stack's environment (apps/mobile_kkisi/.local/stack.json). Never reads any other .env file.
import { spawn } from 'node:child_process';
import { env } from './stack.mjs';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error('usage: with-stack.mjs <command> [...args]'); process.exit(2); }
const bin = cmd === 'next' ? new URL('../node_modules/.bin/next', import.meta.url).pathname : cmd;
const child = spawn(bin, args, { stdio: 'inherit', env: { ...process.env, ...env() } });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
