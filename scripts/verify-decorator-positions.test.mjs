import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);

test('built generation CLIs preserve exported class identities and request/response types', { timeout: 180_000 }, async () => {
  const temporaryRoot = path.join(root, '.tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const cwd = await mkdtemp(path.join(temporaryRoot, 'decorator-cli-'));
  const run = (script, args = []) => exec(process.execPath, [path.join(root, script), ...args], {
    cwd, env: { ...process.env, TMPDIR: temporaryRoot }, timeout: 60_000,
  });
  const configure = (portable) => writeFile(path.join(cwd, 'zelt.config.ts'), `
    import { defineConfig } from '@zeltjs/cli';
    import { honoClientPlugin } from '@zeltjs/hono-client';
    export default defineConfig({
      app: () => import('./app').then(({ app }) => app),
      plugins: [honoClientPlugin(${portable ? "{ portable: true, tsconfig: './tsconfig.json' }" : '{}'})],
      build: { command: 'pnpm exec tsdown' },
    });
  `);
  try {
    await symlink(path.join(root, 'examples/tinyjs-desktop/node_modules'), path.join(cwd, 'node_modules'), 'dir');
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
    await writeFile(path.join(cwd, 'app.ts'), `
      import { Controller, createApp, http, Post, request, response } from '@zeltjs/core';
      import * as v from 'valibot';
      import DefaultController from './default-controller';
      @Controller('/items')
      class InternalController {
        @Post('/')
        async create(req = request(v.object({ title: v.string() })), res = response()) {
          const input = await req.body();
          return res.json({ id: 1, title: input.title }, 201);
        }
      }
      export { InternalController as PublicController };
      export const app = createApp([http({ controllers: [InternalController, DefaultController] })]);
    `);
    await writeFile(path.join(cwd, 'default-controller.ts'), `
      import { Controller, Get } from '@zeltjs/core';
      @Controller('/default')
      export default class DefaultController {
        @Get('/')
        show() { return { id: 'default' }; }
      }
    `);
    await writeFile(path.join(cwd, 'tsconfig.json'), JSON.stringify({
      extends: path.join(root, 'examples/tinyjs-desktop/tsconfig.json'),
      compilerOptions: { types: [] }, include: ['./app.ts', './client.ts', './generated/*.ts'],
    }));
    await writeFile(path.join(cwd, 'tsdown.config.ts'), `
      import swc from '@rollup/plugin-swc';
      import { defineConfig } from 'tsdown';
      export default defineConfig({
        plugins: [swc({ jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { decoratorVersion: '2022-03' } } })],
        entry: ['app.ts'], outDir: 'dist', format: ['esm'], fixedExtension: false, dts: false,
      });
    `);
    await writeFile(path.join(cwd, 'client.ts'), `
      import { hc } from 'hono/client';
      import type { AppType } from './generated/app-type';
      const client = hc<AppType>('http://localhost');
      async function verify() {
        const response = await client.items.$post({ json: { title: 'typed' } });
        if (response.status === 201) {
          const body = await response.json();
          const id: number = body.id;
          const title: string = body.title;
          // @ts-expect-error response fields must retain their types
          const wrong: string = body.id;
          return [id, title, wrong];
        }
        return undefined;
      }
      // @ts-expect-error request body must retain its types
      client.items.$post({ json: { title: 123 } });
      // @ts-expect-error nonexistent routes must not become available
      client.missing.$get();
      void verify;
    `);
    await configure(false);
    await run('packages/hono-client/dist/cli.js', ['generate', '--config', 'zelt.config.ts']);
    const standard = await readFile(path.join(cwd, 'generated/app-type.ts'), 'utf8');
    assert.match(standard, /PublicController as InternalController/);
    assert.match(standard, /default as DefaultController/);
    await run('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.json']);

    await configure(true);
    await run('packages/hono-client/dist/cli.js', ['generate', '--config', 'zelt.config.ts']);
    const generated = await readFile(path.join(cwd, 'generated/app-type.ts'), 'utf8');
    assert.match(generated, /status: 201/);
    assert.doesNotMatch(generated, /InternalController|PublicController/);
    await run('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.json']);
    await run('packages/cli/dist/cli.js', ['build', '--config', 'zelt.config.ts']);
    assert.equal(await readFile(path.join(cwd, 'generated/app-type.ts'), 'utf8'), generated);
    assert.match(await readFile(path.join(cwd, 'dist/app.js'), 'utf8'), /InternalController/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
