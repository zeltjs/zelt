import { describe, expect, it } from 'vitest';

import type { CloudflareRuntimeContext } from './cloudflare-runtime-context.lib';
import {
  getCloudflareRuntimeContext,
  runWithCloudflareRuntimeContext,
  tryGetCloudflareRuntimeContext,
} from './cloudflare-runtime-context.lib';

const createContext = (name: string): CloudflareRuntimeContext => ({
  env: Object.assign(Object.create(null), { NAME: name }) as Env & { NAME: string },
  ctx: {} as ExecutionContext,
});

describe('Cloudflare runtime context', () => {
  it('is unavailable outside request execution', () => {
    expect(tryGetCloudflareRuntimeContext()).toBeUndefined();
    expect(() => getCloudflareRuntimeContext()).toThrow(/outside entry execution/);
  });

  it('propagates and isolates concurrent asynchronous executions', async () => {
    const [first, second] = await Promise.all([
      runWithCloudflareRuntimeContext(createContext('first'), async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return (getCloudflareRuntimeContext().env as Env & { NAME: string }).NAME;
      }),
      runWithCloudflareRuntimeContext(createContext('second'), async () => {
        await Promise.resolve();
        return (getCloudflareRuntimeContext().env as Env & { NAME: string }).NAME;
      }),
    ]);

    expect([first, second]).toEqual(['first', 'second']);
    expect(tryGetCloudflareRuntimeContext()).toBeUndefined();
  });
});
