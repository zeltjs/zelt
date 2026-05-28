import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const cliBin = path.resolve(thisDir, '../dist/cli.js');

describe.skip('zelt run (e2e)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zelt-run-e2e-'));

    await fs.writeFile(
      path.join(tmpDir, 'zelt.config.ts'),
      `export default { cli: { entry: './cli.ts' } }`,
    );

    await fs.writeFile(
      path.join(tmpDir, 'cli.ts'),
      `
const args = process.argv.slice(2);
console.log('CLI args:', args.join(' '));
`,
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('runs cli.ts with no args', () => {
    const result = execFileSync(process.execPath, [cliBin, 'run'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    expect(result).toContain('CLI args:');
  });

  it('runs cli.ts with args', () => {
    const result = execFileSync(process.execPath, [cliBin, 'run', 'hello', 'world'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    expect(result).toContain('CLI args: hello world');
  });
});
