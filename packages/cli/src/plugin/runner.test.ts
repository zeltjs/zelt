import { describe, expect, it, vi } from 'vitest';

import type { ZeltConfig, ZeltPlugin } from '../config/schema';
import { ZeltMultipleBuildHooksError } from '../errors';

import { runBuildHook, runPostBuildHooks, runPreBuildHooks } from './runner';

const createMockApp = () =>
  ({
    ready: vi.fn(),
    shutdown: vi.fn(),
    getControllers: vi.fn().mockReturnValue([]),
  }) as never;

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
    await runPreBuildHooks({ cwd: '/test', config, app: createMockApp() });

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
    await runPreBuildHooks({ cwd: '/test', config, app: createMockApp() });

    expect(called).toHaveBeenCalledOnce();
  });

  it('handles empty plugins array', async () => {
    const config: ZeltConfig = { ...baseConfig, plugins: [] };
    await expect(
      runPreBuildHooks({ cwd: '/test', config, app: createMockApp() }),
    ).resolves.toBeUndefined();
  });

  it('handles undefined plugins', async () => {
    const config: ZeltConfig = { ...baseConfig };
    await expect(
      runPreBuildHooks({ cwd: '/test', config, app: createMockApp() }),
    ).resolves.toBeUndefined();
  });

  it('passes correct context to plugin', async () => {
    const receivedContext = vi.fn();
    const mockApp = createMockApp();

    const plugin: ZeltPlugin = {
      name: 'test',
      preBuild: receivedContext,
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin] };
    await runPreBuildHooks({ cwd: '/my/cwd', config, app: mockApp });

    expect(receivedContext).toHaveBeenCalledWith({
      cwd: '/my/cwd',
      config,
      app: mockApp,
    });
  });
});

describe('runBuildHook', () => {
  const baseConfig: ZeltConfig = {
    entry: './src/app.ts',
    build: { entry: './src/index.ts' },
  };

  it('returns handled: false when no plugin has build hook', async () => {
    const plugin: ZeltPlugin = {
      name: 'no-build',
      preBuild: vi.fn(),
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin] };
    const result = await runBuildHook({ cwd: '/test', config, app: createMockApp() });

    expect(result).toEqual({ handled: false });
  });

  it('runs single build hook and returns handled: true', async () => {
    const buildFn = vi.fn();

    const plugin: ZeltPlugin = {
      name: 'custom-builder',
      build: buildFn,
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin] };
    const result = await runBuildHook({ cwd: '/test', config, app: createMockApp() });

    expect(buildFn).toHaveBeenCalledOnce();
    expect(result).toEqual({ handled: true });
  });

  it('throws ZeltMultipleBuildHooksError when multiple plugins have build hook', async () => {
    const plugin1: ZeltPlugin = {
      name: 'builder1',
      build: vi.fn(),
    };

    const plugin2: ZeltPlugin = {
      name: 'builder2',
      build: vi.fn(),
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin1, plugin2] };

    await expect(runBuildHook({ cwd: '/test', config, app: createMockApp() })).rejects.toThrow(
      ZeltMultipleBuildHooksError,
    );
  });

  it('passes correct context to build hook', async () => {
    const buildFn = vi.fn();
    const mockApp = createMockApp();

    const plugin: ZeltPlugin = {
      name: 'test',
      build: buildFn,
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin] };
    await runBuildHook({ cwd: '/my/cwd', config, app: mockApp });

    expect(buildFn).toHaveBeenCalledWith({
      cwd: '/my/cwd',
      config,
      app: mockApp,
    });
  });

  it('handles empty plugins array', async () => {
    const config: ZeltConfig = { ...baseConfig, plugins: [] };
    const result = await runBuildHook({ cwd: '/test', config, app: createMockApp() });

    expect(result).toEqual({ handled: false });
  });

  it('handles undefined plugins', async () => {
    const config: ZeltConfig = { ...baseConfig };
    const result = await runBuildHook({ cwd: '/test', config, app: createMockApp() });

    expect(result).toEqual({ handled: false });
  });
});

describe('runPostBuildHooks', () => {
  const baseConfig: ZeltConfig = {
    entry: './src/app.ts',
    build: { entry: './src/index.ts' },
  };

  it('calls postBuild hooks in order', async () => {
    const order: string[] = [];

    const plugin1: ZeltPlugin = {
      name: 'plugin1',
      postBuild: async () => {
        order.push('plugin1');
      },
    };

    const plugin2: ZeltPlugin = {
      name: 'plugin2',
      postBuild: async () => {
        order.push('plugin2');
      },
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin1, plugin2] };
    await runPostBuildHooks({ cwd: '/test', config, app: createMockApp() }, { success: true });

    expect(order).toEqual(['plugin1', 'plugin2']);
  });

  it('passes result to postBuild hook', async () => {
    const postBuildFn = vi.fn();

    const plugin: ZeltPlugin = {
      name: 'test',
      postBuild: postBuildFn,
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [plugin] };
    const mockApp = createMockApp();
    await runPostBuildHooks({ cwd: '/test', config, app: mockApp }, { success: false });

    expect(postBuildFn).toHaveBeenCalledWith(
      { cwd: '/test', config, app: mockApp },
      { success: false },
    );
  });

  it('handles empty plugins array', async () => {
    const config: ZeltConfig = { ...baseConfig, plugins: [] };
    await expect(
      runPostBuildHooks({ cwd: '/test', config, app: createMockApp() }, { success: true }),
    ).resolves.toBeUndefined();
  });

  it('handles undefined plugins', async () => {
    const config: ZeltConfig = { ...baseConfig };
    await expect(
      runPostBuildHooks({ cwd: '/test', config, app: createMockApp() }, { success: true }),
    ).resolves.toBeUndefined();
  });

  it('skips plugins without postBuild hook', async () => {
    const postBuildFn = vi.fn();

    const pluginWithHook: ZeltPlugin = {
      name: 'with-hook',
      postBuild: postBuildFn,
    };

    const pluginWithoutHook: ZeltPlugin = {
      name: 'without-hook',
    };

    const config: ZeltConfig = { ...baseConfig, plugins: [pluginWithoutHook, pluginWithHook] };
    await runPostBuildHooks({ cwd: '/test', config, app: createMockApp() }, { success: true });

    expect(postBuildFn).toHaveBeenCalledOnce();
  });
});
