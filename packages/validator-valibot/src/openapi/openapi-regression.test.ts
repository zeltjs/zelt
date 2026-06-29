import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Controller, request as coreRequest, createApp, http, Post } from '@zeltjs/core';
import { generateOpenApi } from '@zeltjs/openapi';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { valibotAdapter } from './valibot-adapter.lib';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

type OpenApiDoc = {
  readonly paths: Record<string, Record<string, { readonly requestBody?: unknown }>>;
  readonly components: { readonly schemas: Record<string, unknown> };
};

export const CoreImportSchema = v.object({
  name: v.string(),
});

export const LocalRequestSchema = v.object({
  name: v.string(),
});

const request = <T>(value: T): T => value;

@Controller('/core-import')
class CoreImportController {
  @Post('/')
  async create(req = coreRequest(CoreImportSchema)) {
    return await req.body();
  }
}

@Controller('/local-request')
class LocalRequestController {
  @Post('/')
  create(_req = request(LocalRequestSchema)) {
    return { ok: true };
  }
}

const generateDoc = async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
  try {
    const app = createApp([http({ controllers: [CoreImportController, LocalRequestController] })]);
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

describe('OpenAPI request() import compatibility', () => {
  it('generates request body schema for request() imported from @zeltjs/core', async () => {
    const doc = await generateDoc();

    expect(doc.paths['/core-import']?.['post']?.requestBody).toBeDefined();
    expect(doc.components.schemas['CoreImportController_create_Request']).toMatchObject({
      type: 'object',
    });
  });

  it('ignores unrelated local functions named request()', async () => {
    const doc = await generateDoc();

    expect(doc.paths['/local-request']?.['post']?.requestBody).toBeUndefined();
    expect(doc.components.schemas['LocalRequestController_create_Request']).toBeUndefined();
  });
});
