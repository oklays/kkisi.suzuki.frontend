// TEST-ONLY TCP proxy in front of the TOKO test store, injecting REAL connection failures at protocol-visible moments. It understands just enough of the MariaDB wire
// protocol to find commands (packets with sequence 0: 0x03 COM_QUERY text, 0x17 COM_STMT_EXECUTE). Faults are ONE-SHOT: armed, they fire once, then the proxy is transparent.
//   cut-mid-transaction(n)   after the n-th statement of a transaction has been EXECUTED by the server, kill both sockets (server rolls the open transaction back; the client sees a lost connection)
//   cut-before-commit        kill both sockets when COMMIT arrives, WITHOUT forwarding it (nothing was committed)
//   drop-ack-after-commit    forward COMMIT, let the server COMMIT, then swallow the reply and kill the client socket (committed on the server; the client sees a network error)
//   refuse-next              close the next new connection immediately (server unreachable)
import net from 'node:net';

export async function startFaultProxy({ host, port }) {
  const state = { fault: null, fired: [], connections: 0 };
  const server = net.createServer((client) => {
    state.connections++;
    if (state.fault?.mode === 'refuse-next') { state.fired.push('refuse-next'); state.fault = null; client.destroy(); return; }
    const upstream = net.connect({ host, port });
    let inTx = false, txCmds = 0, awaitReply = null;   // awaitReply: what to do with the next server data chunk
    const kill = () => { client.destroy(); upstream.destroy(); };
    upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
    client.on('data', (chunk) => {
      for (let off = 0; off + 5 <= chunk.length;) {
        const len = chunk.readUIntLE(off, 3), seq = chunk[off + 3], cmd = chunk[off + 4];
        if (seq === 0 && (cmd === 0x03 || cmd === 0x17)) {
          const text = cmd === 0x03 ? chunk.subarray(off + 5, off + 4 + len).toString('utf8').trim().toLowerCase() : '';
          if (/^(begin|start transaction)/.test(text)) { inTx = true; txCmds = 0; }
          else if (/^commit/.test(text)) {
            if (state.fault?.mode === 'cut-before-commit') { state.fired.push('cut-before-commit'); state.fault = null; kill(); return; }
            if (state.fault?.mode === 'drop-ack-after-commit') { state.fired.push('drop-ack-after-commit'); state.fault = null; awaitReply = 'drop'; }
            inTx = false;
          } else if (/^(rollback)/.test(text)) inTx = false;
          else if (inTx) { txCmds++; if (state.fault?.mode === 'cut-mid-transaction' && txCmds === state.fault.after) { state.fired.push(`cut-mid-transaction(${txCmds})`); state.fault = null; awaitReply = 'drop'; } }
        }
        off += 4 + len;
      }
      upstream.write(chunk);
    });
    upstream.on('data', (chunk) => { if (awaitReply === 'drop') { awaitReply = null; kill(); return; } client.write(chunk); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port, state,
    arm(mode, opts = {}) { state.fault = { mode, after: opts.after ?? 1 }; },
    async close() { await new Promise((resolve) => server.close(resolve)); },
  };
}
