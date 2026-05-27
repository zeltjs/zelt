import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SchemaResolver } from '@zeltjs/openapi';
import { generateOpenApi } from '@zeltjs/openapi';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';
import { describe, expect, it } from 'vitest';

import { app } from '../src/app';

const tsconfig = resolve(__dirname, '../tsconfig.json');
const fixturePath = resolve(__dirname, 'fixtures/openapi.expected.json');

// vitest's import() resolves .ts paths through its loader; the default
// pathToFileURL-based resolver in @zeltjs/openapi only handles compiled .js.
const schemaResolver: SchemaResolver = async (modulePath) =>
  (await import(modulePath)) as Record<string, unknown>;

const generateDoc = async (): Promise<unknown> => {
  const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
  await generateOpenApi(app, {
    distDir: dist,
    tsconfig,
    title: 'Hello World API',
    version: '1.0.0',
    schemaAdapter: valibotAdapter,
    schemaResolver,
  });
  return JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as unknown;
};

describe('OpenAPI generation (hello-world)', () => {
  it('matches the committed fixture', async () => {
    const actual = await generateDoc();

    if (process.env['UPDATE_OPENAPI_FIXTURE']) {
      await writeFile(fixturePath, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    }

    const expected = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;
    expect(actual).toEqual(expected);
  });
});
