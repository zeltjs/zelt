import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findConfigFile } from './load-config';

describe('findConfigFile', () => {
  it('finds zelt.config.ts at cwd', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zelt-cfg-'));
    const file = join(dir, 'zelt.config.ts');
    await writeFile(file, 'export default {}');
    const found = await findConfigFile(dir);
    expect(found).toBe(file);
  });

  it('returns undefined when no config exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zelt-cfg-'));
    const found = await findConfigFile(dir);
    expect(found).toBeUndefined();
  });

  it('finds .mts variant', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zelt-cfg-'));
    const file = join(dir, 'zelt.config.mts');
    await writeFile(file, 'export default {}');
    const found = await findConfigFile(dir);
    expect(found).toBe(file);
  });
});
