// packages/contract/src/test/generate-client.test.ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateClient } from '../generate-client';

const fixtureGlob = resolve(import.meta.dirname, 'fixtures/*.controller.ts');
const tsconfigPath = resolve(import.meta.dirname, '../../tsconfig.json');

describe('generateClient', () => {
  it('writes app.gen.ts and openapi.json', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const result = await generateClient({
      controllers: [fixtureGlob],
      dist,
      tsconfig: tsconfigPath,
    });

    expect(result.appGenChanged).toBe(true);
    expect(result.openApiChanged).toBe(true);

    const appGen = await readFile(join(dist, 'app.gen.ts'), 'utf8');
    expect(appGen).toContain('export type AppType = BuildAppType<[');

    const parsed: unknown = JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8'));
    expect(parsed).toMatchObject({ openapi: '3.1.0' });
  });

  it('returns changed=false on second run with no changes', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    await generateClient({
      controllers: [fixtureGlob],
      dist,
      tsconfig: tsconfigPath,
    });

    const secondResult = await generateClient({
      controllers: [fixtureGlob],
      dist,
      tsconfig: tsconfigPath,
    });

    expect(secondResult.appGenChanged).toBe(false);
    expect(secondResult.openApiChanged).toBe(false);
  });
});
