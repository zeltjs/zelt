import { describe, expect, it, vi } from 'vitest';

import { ZeltMultipleBuildHooksError } from './cli.errors';
import type { ZeltConfig, ZeltPlugin } from './config/config.types';
import { runBuildHook, runPostBuildHooks, runPreBuildHooks } from './plugin-runner.lib';

const createLoadStaticApp = () => vi.fn().mockResolvedValue({ http: { getControllers: vi.fn() } });

const createBaseConfig = (): ZeltConfig => ({
  app: () => ({ http: {} }),
  build: { entry: './src/index.ts' },
});

describe('runPreBuildHooks', () => {
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

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin1, plugin2] };
    await runPreBuildHooks({ cwd: '/test', config, loadStaticApp: createLoadStaticApp() });

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

    const config: ZeltConfig = {
      ...createBaseConfig(),
      plugins: [pluginWithoutHook, pluginWithHook],
    };
    await runPreBuildHooks({ cwd: '/test', config, loadStaticApp: createLoadStaticApp() });

    expect(called).toHaveBeenCalledOnce();
  });

  it('handles empty plugins array', async () => {
    const config: ZeltConfig = { ...createBaseConfig(), plugins: [] };
    await expect(
      runPreBuildHooks({ cwd: '/test', config, loadStaticApp: createLoadStaticApp() }),
    ).resolves.toBeUndefined();
  });

  it('handles undefined plugins', async () => {
    const config: ZeltConfig = { ...createBaseConfig() };
    await expect(
      runPreBuildHooks({ cwd: '/test', config, loadStaticApp: createLoadStaticApp() }),
    ).resolves.toBeUndefined();
  });

  it('passes correct context to plugin', async () => {
    const receivedContext = vi.fn();
    const loadStaticApp = createLoadStaticApp();

    const plugin: ZeltPlugin = {
      name: 'test',
      preBuild: receivedContext,
    };

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin] };
    await runPreBuildHooks({ cwd: '/my/cwd', config, loadStaticApp });

    expect(receivedContext).toHaveBeenCalledWith({
      cwd: '/my/cwd',
      build: config.build,
      loadStaticApp,
    });
  });
});

describe('runBuildHook', () => {
  it('returns handled: false when no plugin has build hook', async () => {
    const plugin: ZeltPlugin = {
      name: 'no-build',
      preBuild: vi.fn(),
    };

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin] };
    const result = await runBuildHook({
      cwd: '/test',
      config,
      loadStaticApp: createLoadStaticApp(),
    });

    expect(result).toEqual({ handled: false });
  });

  it('runs single build hook and returns handled: true', async () => {
    const buildFn = vi.fn();

    const plugin: ZeltPlugin = {
      name: 'custom-builder',
      build: buildFn,
    };

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin] };
    const result = await runBuildHook({
      cwd: '/test',
      config,
      loadStaticApp: createLoadStaticApp(),
    });

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

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin1, plugin2] };

    await expect(
      runBuildHook({ cwd: '/test', config, loadStaticApp: createLoadStaticApp() }),
    ).rejects.toThrow(ZeltMultipleBuildHooksError);
  });

  it('passes correct context to build hook', async () => {
    const buildFn = vi.fn();
    const loadStaticApp = createLoadStaticApp();

    const plugin: ZeltPlugin = {
      name: 'test',
      build: buildFn,
    };

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin] };
    await runBuildHook({ cwd: '/my/cwd', config, loadStaticApp });

    expect(buildFn).toHaveBeenCalledWith({
      cwd: '/my/cwd',
      build: config.build,
      loadStaticApp,
    });
  });

  it('handles empty plugins array', async () => {
    const config: ZeltConfig = { ...createBaseConfig(), plugins: [] };
    const result = await runBuildHook({
      cwd: '/test',
      config,
      loadStaticApp: createLoadStaticApp(),
    });

    expect(result).toEqual({ handled: false });
  });

  it('handles undefined plugins', async () => {
    const config: ZeltConfig = { ...createBaseConfig() };
    const result = await runBuildHook({
      cwd: '/test',
      config,
      loadStaticApp: createLoadStaticApp(),
    });

    expect(result).toEqual({ handled: false });
  });
});

describe('runPostBuildHooks', () => {
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

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin1, plugin2] };
    await runPostBuildHooks(
      { cwd: '/test', config, loadStaticApp: createLoadStaticApp() },
      { success: true },
    );

    expect(order).toEqual(['plugin1', 'plugin2']);
  });

  it('passes result to postBuild hook', async () => {
    const postBuildFn = vi.fn();

    const plugin: ZeltPlugin = {
      name: 'test',
      postBuild: postBuildFn,
    };

    const config: ZeltConfig = { ...createBaseConfig(), plugins: [plugin] };
    const loadStaticApp = createLoadStaticApp();
    await runPostBuildHooks({ cwd: '/test', config, loadStaticApp }, { success: false });

    expect(postBuildFn).toHaveBeenCalledWith(
      { cwd: '/test', build: config.build, loadStaticApp },
      { success: false },
    );
  });

  it('handles empty plugins array', async () => {
    const config: ZeltConfig = { ...createBaseConfig(), plugins: [] };
    await expect(
      runPostBuildHooks(
        { cwd: '/test', config, loadStaticApp: createLoadStaticApp() },
        { success: true },
      ),
    ).resolves.toBeUndefined();
  });

  it('handles undefined plugins', async () => {
    const config: ZeltConfig = { ...createBaseConfig() };
    await expect(
      runPostBuildHooks(
        { cwd: '/test', config, loadStaticApp: createLoadStaticApp() },
        { success: true },
      ),
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

    const config: ZeltConfig = {
      ...createBaseConfig(),
      plugins: [pluginWithoutHook, pluginWithHook],
    };
    await runPostBuildHooks(
      { cwd: '/test', config, loadStaticApp: createLoadStaticApp() },
      { success: true },
    );

    expect(postBuildFn).toHaveBeenCalledOnce();
  });
});
