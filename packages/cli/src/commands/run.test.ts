import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
// Resolve the built CLI binary relative to this test file
const cliBin = path.resolve(thisDir, '../../dist/cli.js');
// Resolve @zeltjs/command from the CLI package's own node_modules (set at install time)
const commandPkgPath = fileURLToPath(import.meta.resolve('@zeltjs/command'));

describe('zelt run (e2e)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zelt-run-e2e-'));
    await fs.mkdir(path.join(tmpDir, 'src', 'commands'), { recursive: true });

    await fs.writeFile(
      path.join(tmpDir, 'zelt.config.ts'),
      `export default { commands: 'src/commands/**/*.mjs' }`,
    );

    // Use .mjs (plain ESM) to avoid the need for TypeScript compilation in the temp dir.
    // Import @zeltjs/command via absolute path since the temp dir has no node_modules.
    await fs.writeFile(
      path.join(tmpDir, 'src', 'commands', 'hello.mjs'),
      `
import { Command } from '${commandPkgPath}';

export class HelloCommand {
  args = {
    name: { type: 'positional', default: 'World' },
  };

  async run(ctx) {
    console.log('Hello, ' + ctx.args.name + '!');
  }
}
Command({ name: 'hello' })(HelloCommand);
`,
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('runs command with default args', () => {
    const result = execFileSync(process.execPath, [cliBin, 'run', 'hello'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    expect(result).toContain('Hello, World!');
  });

  it('runs command with provided args', () => {
    const result = execFileSync(process.execPath, [cliBin, 'run', 'hello', 'Claude'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    expect(result).toContain('Hello, Claude!');
  });
});
