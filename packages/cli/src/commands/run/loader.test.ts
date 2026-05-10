import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Command } from '@zeltjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCommands } from './loader';

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
    class GreetCommandBase {
      run() {}
    }
    const GreetCommand = Command({ name: 'greet' })(GreetCommandBase);

    const commandFile = join(testDir, 'greet.command.mjs');
    await writeFile(commandFile, '// placeholder');

    vi.doMock(commandFile, () => ({ GreetCommand }));

    const result = await loadCommands(testDir, '*.mjs');

    expect(result.size).toBe(1);
    expect(result.has('greet')).toBe(true);
  });

  it('returns empty map when no commands found', async () => {
    const result = await loadCommands(testDir, '*.mjs');

    expect(result.size).toBe(0);
  });

  it('handles multiple commands in one file', async () => {
    class FooCommandBase {
      run() {}
    }
    class BarCommandBase {
      run() {}
    }
    const FooCommand = Command({ name: 'foo' })(FooCommandBase);
    const BarCommand = Command({ name: 'bar' })(BarCommandBase);

    const commandFile = join(testDir, 'commands.mjs');
    await writeFile(commandFile, '// placeholder');

    vi.doMock(commandFile, () => ({ FooCommand, BarCommand }));

    const result = await loadCommands(testDir, '*.mjs');

    expect(result.size).toBe(2);
    expect(result.has('foo')).toBe(true);
    expect(result.has('bar')).toBe(true);
  });
});
