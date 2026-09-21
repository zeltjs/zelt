import { describe, expect, it } from 'vitest';

import { getCommandContext, runInCommandContext } from './command-context.lib';

describe('command-context', () => {
  it('throws outside command context', () => {
    expect(() => getCommandContext()).toThrow('args() called outside command execution');
  });

  it('returns context within runInCommandContext', () => {
    const ctx = { commandName: 'greet', argv: ['world', '--port', '3000'] };

    const result = runInCommandContext(ctx, () => getCommandContext());

    expect(result).toBe(ctx);
    expect(result.commandName).toBe('greet');
    expect(result.argv).toEqual(['world', '--port', '3000']);
  });

  it('supports nested contexts (inner overrides outer)', () => {
    const outer = { commandName: 'outer', argv: [] };
    const inner = { commandName: 'inner', argv: [] };

    runInCommandContext(outer, () => {
      const outerResult = getCommandContext();
      expect(outerResult.commandName).toBe('outer');

      runInCommandContext(inner, () => {
        const innerResult = getCommandContext();
        expect(innerResult.commandName).toBe('inner');
      });

      const outerResult2 = getCommandContext();
      expect(outerResult2.commandName).toBe('outer');
    });
  });
});
