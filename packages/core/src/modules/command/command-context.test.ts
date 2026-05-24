import { describe, expect, it } from 'vitest';

import { getCommandContext, runInCommandContext } from './command-context';

describe('command-context', () => {
  it('throws outside command context', () => {
    expect(() => getCommandContext()).toThrow('args() called outside command execution');
  });

  it('returns context within runInCommandContext', () => {
    const ctx = { parsedArgs: { target: 'world', port: 3000 } };

    const result = runInCommandContext(ctx, () => getCommandContext());

    expect(result).toBe(ctx);
    expect(result.parsedArgs).toEqual({ target: 'world', port: 3000 });
  });

  it('supports nested contexts (inner overrides outer)', () => {
    const outer = { parsedArgs: { env: 'dev' } };
    const inner = { parsedArgs: { env: 'prod' } };

    runInCommandContext(outer, () => {
      const outerResult = getCommandContext();
      expect(outerResult.parsedArgs['env']).toBe('dev');

      runInCommandContext(inner, () => {
        const innerResult = getCommandContext();
        expect(innerResult.parsedArgs['env']).toBe('prod');
      });

      const outerResult2 = getCommandContext();
      expect(outerResult2.parsedArgs['env']).toBe('dev');
    });
  });
});
