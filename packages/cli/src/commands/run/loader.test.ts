import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadCommands } from './loader';

const singleCommandFile = `
import { Command } from '@zeltjs/core';
class GreetCommand { run() {} }
Command({ name: 'greet' })(GreetCommand);
export { GreetCommand };
`;

const multiCommandFile = `
import { Command } from '@zeltjs/core';
class FooCommand { run() {} }
class BarCommand { run() {} }
Command({ name: 'foo' })(FooCommand);
Command({ name: 'bar' })(BarCommand);
export { FooCommand, BarCommand };
`;

describe('loadCommands', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `zelt-loader-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('loads command classes from glob pattern', async () => {
    await writeFile(join(testDir, 'greet.command.mjs'), singleCommandFile);

    const result = await loadCommands(testDir, '*.mjs');

    expect(result.size).toBe(1);
    expect(result.has('greet')).toBe(true);
  });

  it('returns empty map when no commands found', async () => {
    const result = await loadCommands(testDir, '*.mjs');

    expect(result.size).toBe(0);
  });

  it('handles multiple commands in one file', async () => {
    await writeFile(join(testDir, 'commands.mjs'), multiCommandFile);

    const result = await loadCommands(testDir, '*.mjs');

    expect(result.size).toBe(2);
    expect(result.has('foo')).toBe(true);
    expect(result.has('bar')).toBe(true);
  });
});
