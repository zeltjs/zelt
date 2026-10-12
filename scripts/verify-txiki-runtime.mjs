import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'zelt-txiki-verify-'));
const binary = process.env.TJS_BIN ?? 'tjs';
let child;
try {
  const bundle = await rolldown({ input: path.join(root, 'scripts/fixtures/txiki-runtime.mjs'), platform: 'neutral' });
  const entry = path.join(temporary, 'main.js');
  await bundle.write({ dir: temporary, entryFileNames: 'main.js', format: 'esm' });
  await bundle.close();
  child = spawn(binary, ['run', entry], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const exited = once(child, 'exit');
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`txiki.js did not become ready: ${errors}\n${output}`)), 20000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`txiki.js exited ${code}: ${errors}\n${output}`)); });
    child.stdout.on('data', data => {
      output += data;
      const line = output.split('\n').slice(0, -1).find(value => value.startsWith('{"event":"ready"'));
      if (line) { clearTimeout(timeout); resolve(JSON.parse(line)); }
    });
  });
  assert.equal(ready.bridgeRequests, 25);
  const origin = `http://127.0.0.1:${ready.port}`;
  const results = await Promise.all(Array.from({ length: 25 }, (_, id) => fetch(`${origin}/api/echo?id=${id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  })));
  for (const [id, result] of results.entries()) {
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { id: String(id), body: { id }, path: '/api/echo' });
  }
  assert.deepEqual([...new Uint8Array(await (await fetch(`${origin}/api/binary`)).arrayBuffer())], [0, 128, 255]);
  assert.equal((await fetch(`${origin}/api/error`)).status, 422);
  child.kill('SIGTERM');
  const [code, signal] = await Promise.race([exited, new Promise((_, reject) => {
    const timeout = setTimeout(() => reject(new Error('txiki.js did not shut down after SIGTERM')), 5000);
    timeout.unref();
  })]);
  assert.equal(code, 0, errors);
  assert.equal(signal, null);
  console.log('txiki.js: 25 native bridge calls, 25 TCP requests, binary/error responses, lifecycle and SIGTERM passed.');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await rm(temporary, { recursive: true, force: true });
}
