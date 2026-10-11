import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const blocker = 'data:text/javascript,' + encodeURIComponent(`
  import { registerHooks } from 'node:module';
  registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'node:async_hooks' || specifier === 'async_hooks') {
      throw new Error('ALS is unavailable in this runtime');
    }
    return next(specifier, context);
  }});
`);

describe('portable context distribution', () => {
  for (const format of ['esm', 'cjs']) {
    it(`runs the ${format} core without importing async_hooks`, () => {
      const source = `
        import assert from 'node:assert/strict';
        import { createRequire } from 'node:module';
        const core = ${format === 'esm'
          ? "await import('./packages/core/dist/index.js')"
          : "createRequire(import.meta.url)('./packages/core/dist/index.cjs')"};
        class Value {
          async use(next, req = core.request()) {
            await Promise.resolve();
            await next(req.queryParam('id'));
          }
        }
        core.Middleware(Value);
        class Endpoint {
          async handle(req = core.request(), value = core.middlewareValue(Value)) {
            await Promise.resolve();
            assert.throws(() => core.middlewareValue(Value), /outside entry execution/);
            return { value, body: await req.body() };
          }
        }
        core.Post('/')(Endpoint.prototype, 'handle', Object.getOwnPropertyDescriptor(Endpoint.prototype, 'handle'));
        core.UseMiddleware(Value)(Endpoint);
        core.Controller('/')(Endpoint);
        class Diagnostics { onError(error) { return Response.json({ message: error.message, stack: error.stack }, { status: 500 }); } }
        core.ErrorHandler(Diagnostics);
        const runtime = await core.createApp([core.http({ controllers: [Endpoint], errorHandlers: [Diagnostics] })]).createRuntime();
        const responses = await Promise.all(Array.from({ length: 20 }, (_, id) =>
          runtime.http.request('/?id=' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
        ));
        for (const [id, response] of responses.entries()) {
          const payload = await response.json();
          assert.equal(response.status, 200, JSON.stringify(payload));
          assert.deepEqual(payload, { value: String(id), body: { id } });
        }
        await runtime.shutdown();
        await assert.rejects(core.createApp([]).createRuntime({ contextMode: 'async' }), /enableAsyncContext/);
        await assert.rejects(core.createApp([]).createRuntime({ contextMode: 'invalid' }), /Context mode must be/);
      `;
      const result = spawnSync(process.execPath, ['--import', blocker, '--input-type=module', '--eval', source], {
        cwd: rootDir, encoding: 'utf8', timeout: 15000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    });

    it(`opts the ${format} core into ALS without changing an existing sync runtime`, () => {
      const coreLoad = format === 'esm'
        ? "await import('./packages/core/dist/index.js')"
        : "createRequire(import.meta.url)('./packages/core/dist/index.cjs')";
      const asyncLoad = format === 'esm'
        ? "await import('./packages/core/dist/async-context.js')"
        : "createRequire(import.meta.url)('./packages/core/dist/async-context.cjs')";
      const source = `
        import assert from 'node:assert/strict';
        import { createRequire } from 'node:module';
        const core = ${coreLoad};
        class Endpoint {
          async handle(req = core.request()) {
            const captured = core.captureContext();
            await Promise.resolve();
            if (captured.mode === 'sync') assert.throws(() => core.request(), /outside entry execution/);
            else assert.equal(core.request().path(), req.path());
            return { mode: captured.mode, path: req.path() };
          }
        }
        core.Get('/')(Endpoint.prototype, 'handle', Object.getOwnPropertyDescriptor(Endpoint.prototype, 'handle'));
        core.Controller('/')(Endpoint);
        const app = core.createApp([core.http({ controllers: [Endpoint] })]);
        const portable = await app.createRuntime();
        const asyncContext = ${asyncLoad};
        asyncContext.enableAsyncContext();
        asyncContext.enableAsyncContext();
        const asynchronous = await app.createRuntime();
        const [syncResult, asyncResult] = await Promise.all([portable.http.request('/'), asynchronous.http.request('/')]);
        assert.equal(syncResult.status, 200);
        assert.equal(asyncResult.status, 200);
        assert.deepEqual(await syncResult.json(), { mode: 'sync', path: '/' });
        assert.deepEqual(await asyncResult.json(), { mode: 'async', path: '/' });
        await portable.shutdown();
        await asynchronous.shutdown();
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
        cwd: rootDir, encoding: 'utf8', timeout: 15000,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    });
  }
});
