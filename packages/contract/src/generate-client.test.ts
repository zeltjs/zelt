import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { UserController } from './analyzer/_fixtures/sample.controller';
import { generateClient } from './generate-client';

const fixtureSource = resolve(import.meta.dirname, 'analyzer/_fixtures/sample.controller.ts');
const tsconfigPath = resolve(import.meta.dirname, '../tsconfig.json');

describe('generateClient', () => {
  it('writes app.gen.ts and openapi.json', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'koya-contract-'));
    const result = await generateClient({
      controllers: [{ class: UserController, source: fixtureSource }],
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
    const dist = await mkdtemp(join(tmpdir(), 'koya-contract-'));
    await generateClient({
      controllers: [{ class: UserController, source: fixtureSource }],
      dist,
      tsconfig: tsconfigPath,
    });
    const result = await generateClient({
      controllers: [{ class: UserController, source: fixtureSource }],
      dist,
      tsconfig: tsconfigPath,
    });
    expect(result.appGenChanged).toBe(false);
    expect(result.openApiChanged).toBe(false);
  });

  it('throws clear error when controllers entry is bare class', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'koya-contract-'));
    await expect(
      generateClient({
        controllers: [UserController],
        dist,
        tsconfig: tsconfigPath,
      }),
    ).rejects.toThrow(/UserController.*\{ class, source/);
  });
});
