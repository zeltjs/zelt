import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { findBundledHonoModules, findForbiddenSpecifiers, findSpecifiers } from './tree-shaking-rules.mjs';
import { verifyTreeShaking } from './verify-dist-tree-shaking.mjs';

describe('findSpecifiers', () => {
  it('collects static, side-effect, re-export, dynamic and require specifiers', () => {
    const code = [
      "import { a } from 'hono/cors';",
      'import "hono/http-exception";',
      "export { b } from './local.js';",
      "const lazy = () => import('hono/streaming');",
      "const c = require('hono/cookie');",
      "import { d } from 'node:async_hooks';",
    ].join('\n');

    assert.deepEqual(findSpecifiers(code), [
      './local.js',
      'hono/cookie',
      'hono/cors',
      'hono/http-exception',
      'hono/streaming',
      'node:async_hooks',
    ]);
  });
});

describe('findForbiddenSpecifiers', () => {
  it('returns only hono specifiers', () => {
    const code =
      "import 'hono';\nimport x from '@zeltjs/hono-client';\nimport y from 'node:async_hooks';";

    assert.deepEqual(findForbiddenSpecifiers(code), ['hono']);
  });
});

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const createCorePackageFixture = async ({ sideEffects }) => {
  const corePackageDir = await mkdtemp(path.join(os.tmpdir(), 'zelt-tree-shaking-fixture-'));
  temporaryDirectories.push(corePackageDir);
  await mkdir(path.join(corePackageDir, 'dist'), { recursive: true });
  await writeFile(
    path.join(corePackageDir, 'package.json'),
    JSON.stringify({
      name: '@zeltjs/core',
      type: 'module',
      ...(sideEffects === undefined ? {} : { sideEffects }),
    }),
  );
  await writeFile(
    path.join(corePackageDir, 'dist', 'index.js'),
    "export * from './di.js';\nexport * from './http.js';\n",
  );
  await writeFile(path.join(corePackageDir, 'dist', 'di.js'), 'export const createValue = () => 42;\n');
  await writeFile(
    path.join(corePackageDir, 'dist', 'http.js'),
    "import { HTTPException } from 'hono/http-exception';\nexport class HttpError extends HTTPException {}\n",
  );
  return corePackageDir;
};

const FIXTURE_CONSUMER_SOURCE = `
import { createValue } from '@zeltjs/core';
if (createValue() !== 42) throw new Error('unexpected value');
`;

describe('verifyTreeShaking', () => {
  it('reports hono when the package does not declare sideEffects', async () => {
    const corePackageDir = await createCorePackageFixture({ sideEffects: undefined });

    const result = await verifyTreeShaking({ corePackageDir, source: FIXTURE_CONSUMER_SOURCE, externalHono: true });

    assert.deepEqual(result.forbidden, ['hono/http-exception']);
  });

  it('drops hono and still runs when the package declares sideEffects: false', async () => {
    const corePackageDir = await createCorePackageFixture({ sideEffects: false });

    const result = await verifyTreeShaking({ corePackageDir, source: FIXTURE_CONSUMER_SOURCE, externalHono: true });

    assert.deepEqual(result.forbidden, []);
    assert.equal(result.runtimeError, undefined);
  });

  it('reports a runtime error when the bundled consumer throws', async () => {
    const corePackageDir = await createCorePackageFixture({ sideEffects: false });

    const result = await verifyTreeShaking({
      corePackageDir,
      source: "import '@zeltjs/core';\nthrow new Error('boom');\n",
    });

    assert.match(String(result.runtimeError?.message), /boom/);
  });
});


it('detects rendered Hono code even when no import specifier remains', () => {
  assert.deepEqual(findBundledHonoModules([{ type: 'chunk', modules: {
    '/repo/node_modules/hono/dist/index.js': { renderedLength: 10 },
    '/repo/node_modules/hono/dist/unused.js': { renderedLength: 0 },
    '/repo/node_modules/other/index.js': { renderedLength: 10 },
  } }]), ['/repo/node_modules/hono/dist/index.js']);
});
