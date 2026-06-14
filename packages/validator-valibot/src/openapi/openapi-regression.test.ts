import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, http } from '@zeltjs/core';
import { generateOpenApi } from '@zeltjs/openapi';
import { describe, expect, it } from 'vitest';

import { CoreImportController } from './fixtures/core-import.controller';
import { ValidatorImportController } from './fixtures/validator-import.controller';
import { valibotAdapter } from './valibot-adapter.lib';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

type OpenApiDoc = {
  readonly paths: Record<string, Record<string, { readonly requestBody?: unknown }>>;
  readonly components: { readonly schemas: Record<string, unknown> };
};

const generateDoc = async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
  try {
    const app = createApp([
      http({ controllers: [CoreImportController, ValidatorImportController] }),
    ]);
    await generateOpenApi(app.http, {
      distDir,
      tsconfig: join(packageDir, 'tsconfig.json'),
      schemaAdapter: valibotAdapter,
    });
    const content = await readFile(join(distDir, 'openapi.json'), 'utf8');
    return JSON.parse(content) as OpenApiDoc;
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
};

describe('OpenAPI validated() import compatibility', () => {
  it('generates request body schema for validated() imported from @zeltjs/core', async () => {
    const doc = await generateDoc();

    expect(doc.paths['/core-import']?.['post']?.requestBody).toBeDefined();
    expect(doc.components.schemas['CoreImportController_create_Request']).toMatchObject({
      type: 'object',
    });
  });

  it('generates request body schema for validated() imported from @zeltjs/validator-valibot', async () => {
    const doc = await generateDoc();

    expect(doc.paths['/validator-import']?.['post']?.requestBody).toBeDefined();
    expect(doc.components.schemas['ValidatorImportController_create_Request']).toMatchObject({
      type: 'object',
    });
  });
});
