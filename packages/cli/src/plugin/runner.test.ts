import { describe, expect, it, vi } from 'vitest';

import type { ZeltConfig } from '../config/schema';

import { runPreBuildHooks } from './runner';
import type { ZeltPlugin } from './types';

describe('runPreBuildHooks', () => {
  const baseConfig: ZeltConfig = {
    entry: './src/app.ts',
    build: { entry: './src/index.ts' },
  };

  it('calls preBuild hooks in order', async () => {
    const order: string[] = [];

    const plugin1: ZeltPlugin = {
      name: 'plugin1',
      preBuild: async () => {
        order.push('plugin1');
      },
    };

    const plugin2: ZeltPlugin = {
      name: 'plugin2',
      preBuild: async () => {
        order.push('plugin2');
      },
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin1, plugin2] };
    await runPreBuildHooks({ cwd: '/test', config });

    expect(order).toEqual(['plugin1', 'plugin2']);
  });

  it('skips plugins without preBuild hook', async () => {
    const called = vi.fn();

    const pluginWithHook: ZeltPlugin = {
      name: 'with-hook',
      preBuild: called,
    };

    const pluginWithoutHook: ZeltPlugin = {
      name: 'without-hook',
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [pluginWithoutHook, pluginWithHook] };
    await runPreBuildHooks({ cwd: '/test', config });

    expect(called).toHaveBeenCalledOnce();
  });

  it('handles empty plugins array', async () => {
    const config: ZeltConfig = { ...baseConfig, plugins: [] };
    await expect(runPreBuildHooks({ cwd: '/test', config })).resolves.toBeUndefined();
  });

  it('handles undefined plugins', async () => {
    const config: ZeltConfig = { ...baseConfig };
    await expect(runPreBuildHooks({ cwd: '/test', config })).resolves.toBeUndefined();
  });

  it('passes correct context to plugin', async () => {
    const receivedContext = vi.fn();

    const plugin: ZeltPlugin = {
      name: 'test',
      preBuild: receivedContext,
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin] };
    await runPreBuildHooks({ cwd: '/my/cwd', config });

    expect(receivedContext).toHaveBeenCalledWith({
      cwd: '/my/cwd',
      config,
    });
  });
});
