import { onTinyjs } from '../../packages/adapter-tinyjs/dist/index.js';
import { createTinyFetch } from '../../packages/adapter-tinyjs/dist/renderer/index.js';
import { onTxiki, prepareTxikiRequest } from '../../packages/adapter-txiki/dist/index.js';
import { Controller, createApp, Get, http, Post, request, response } from '../../packages/core/dist/index.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };

class Endpoint {
  async override(req = request()) {
    return { marker: req.header('X-Override'), body: await req.body() };
  }
  async echo(req = request()) {
    await Promise.resolve();
    return { id: req.queryParam('id'), body: await req.body(), path: req.path() };
  }
  binary() { return new Response(new Uint8Array([0, 128, 255])); }
  error(res = response()) { return res.json({ reason: 'invalid' }, 422); }
}
Post('/echo')(Endpoint.prototype, 'echo', Object.getOwnPropertyDescriptor(Endpoint.prototype, 'echo'));
Post('/override')(Endpoint.prototype, 'override', Object.getOwnPropertyDescriptor(Endpoint.prototype, 'override'));
Get('/binary')(Endpoint.prototype, 'binary', Object.getOwnPropertyDescriptor(Endpoint.prototype, 'binary'));
Get('/error')(Endpoint.prototype, 'error', Object.getOwnPropertyDescriptor(Endpoint.prototype, 'error'));
Controller('/api')(Endpoint);

const prepared = await prepareTxikiRequest(new Request('http://localhost/body', { method: 'POST', body: 'independent' }));
const copy = prepared.clone();
check(await copy.text() === 'independent' && await prepared.text() === 'independent', 'Request clones must be independently readable');

const definition = createApp([http({ controllers: [Endpoint] }), http({ name: 'admin', controllers: [Endpoint] })]);
const desktop = await onTinyjs(definition);
const overridden = await desktop.http.request(new Request('http://localhost/api/override'), {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Override': 'updated' },
  body: JSON.stringify({ value: 'replacement' }),
});
check(overridden.status === 200, 'RequestInit method override was ignored');
const overriddenBody = await overridden.json();
check(overriddenBody.marker === 'updated' && overriddenBody.body.value === 'replacement', 'RequestInit headers or body override was ignored');
const original = new Request('http://localhost/api/override', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Override': 'original' },
  body: JSON.stringify({ value: 'retained' }),
});
const retained = await desktop.http.request(original, {
  headers: { 'Content-Type': 'application/json', 'X-Override': 'changed' },
});
check(retained.status === 200, 'RequestInit header override lost the original method');
const retainedBody = await retained.json();
check(retainedBody.marker === 'changed' && retainedBody.body.value === 'retained', 'RequestInit header override lost the original body');
const bridge = { call: async (_method, payload) => JSON.parse(JSON.stringify(await desktop.api['zelt.fetch'](JSON.parse(JSON.stringify(payload))))) };
const fetch = createTinyFetch({ bridge });
const results = await Promise.all(Array.from({ length: 25 }, (_, id) => fetch(`/api/echo?id=${id}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
})));
for (const [id, result] of results.entries()) {
  const body = await result.json();
  check(result.status === 200 && body.id === String(id) && body.body.id === id && body.path === '/api/echo', 'Concurrent bridge requests must remain isolated');
}
const bytes = new Uint8Array(await (await fetch('/api/binary')).arrayBuffer());
check(bytes.length === 3 && bytes[0] === 0 && bytes[1] === 128 && bytes[2] === 255, 'Binary response bytes changed');
check((await fetch('/api/error')).status === 422, 'HTTP error status changed');
check((await createTinyFetch({ bridge, feature: 'admin' })('/api/binary')).status === 200, 'Named HTTP feature failed');

let nativeDone;
let stopped = false;
const native = { done: new Promise(resolve => { nativeDone = resolve; }), setTitle() {}, push() {}, quit() {} };
desktop.registerShutdown(async () => { await Promise.resolve(); stopped = true; });
desktop.init(native);
nativeDone();
await native.done;
check(stopped, 'Native lifetime completed before runtime shutdown');

const httpApp = await onTxiki(definition);
const server = httpApp.http.serve({ port: 0 });
console.log(JSON.stringify({ event: 'ready', port: server.address.port, bridgeRequests: results.length }));
