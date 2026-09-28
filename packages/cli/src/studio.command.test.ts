import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { StudioPlan } from './studio.command';
import { planStudio, resolvePort, runExtract, runServe } from './studio.command';
import type { StudioServer } from './studio-serve.lib';

const makeRuntime = () => ({ setExitCode: vi.fn() });

const FIXTURE_CONFIG = resolve(
  __dirname,
  '../../studio-extract/test-fixtures/studio-app/studio-app.extract.json',
);

const servePlan: Extract<StudioPlan, { kind: 'serve' }> = {
  kind: 'serve',
  configFile: 'demo.extract.json',
  port: 4400,
  open: false,
  allowIncomplete: false,
};

const extractPlan: Extract<StudioPlan, { kind: 'extract' }> = {
  kind: 'extract',
  configFile: 'demo.extract.json',
  output: undefined,
  allowIncomplete: false,
};

const emptySnapshotJson = JSON.stringify({
  schemaVersion: 1,
  snapshotId: 'a'.repeat(64),
  project: { id: 'demo', name: 'Demo' },
  provenance: 'extracted',
  graph: { groups: [], presentation: { id: 'demo', columns: [] } },
});

const startedServer: StudioServer = {
  url: 'http://localhost:4400',
  address: { address: '127.0.0.1', family: 'IPv4', port: 4400 },
  close: () => Promise.resolve(),
};

describe('resolvePort', () => {
  it('defaults to 4400 when unspecified', () => {
    expect(resolvePort(undefined)).toBe(4400);
  });

  it('defaults to 4400 when the flag was given without a usable value', () => {
    expect(resolvePort('')).toBe(4400);
  });

  it('parses a numeric string', () => {
    expect(resolvePort('8080')).toBe(8080);
  });

  it('returns undefined for a non-numeric value', () => {
    expect(resolvePort('not-a-port')).toBeUndefined();
  });

  it('returns undefined for a negative port', () => {
    expect(resolvePort('-1')).toBeUndefined();
  });

  it('returns undefined for a port above 65535', () => {
    expect(resolvePort('70000')).toBeUndefined();
  });

  it('returns undefined for a non-integer port', () => {
    expect(resolvePort('1.5')).toBeUndefined();
  });
});

describe('planStudio', () => {
  it('plans a serve run on the default port', () => {
    expect(planStudio([], { config: 'demo.extract.json' })).toEqual({
      kind: 'serve',
      configFile: 'demo.extract.json',
      port: 4400,
      open: false,
      allowIncomplete: false,
    });
  });

  it('carries --port, --open and --allow-incomplete into the serve plan', () => {
    expect(
      planStudio([], {
        config: 'demo.extract.json',
        port: '5000',
        open: true,
        'allow-incomplete': true,
      }),
    ).toEqual({
      kind: 'serve',
      configFile: 'demo.extract.json',
      port: 5000,
      open: true,
      allowIncomplete: true,
    });
  });

  it('plans an extract run only when extract is the first raw argument', () => {
    expect(
      planStudio(['extract', '--config', 'demo.extract.json'], {
        config: 'demo.extract.json',
        output: 'out.json',
      }),
    ).toEqual({
      kind: 'extract',
      configFile: 'demo.extract.json',
      output: 'out.json',
      allowIncomplete: false,
    });
  });

  it('rejects a missing --config', () => {
    expect(planStudio([], {})).toEqual({
      kind: 'invalid',
      message: 'zelt studio requires --config <name>.extract.json',
    });
  });

  it('names the subcommand when extract is invoked without --config', () => {
    expect(planStudio(['extract'], { config: '' })).toEqual({
      kind: 'invalid',
      message: 'zelt studio extract requires --config <name>.extract.json',
    });
  });

  it('rejects an invalid --port before anything is extracted', () => {
    expect(planStudio([], { config: 'demo.extract.json', port: '70000' })).toEqual({
      kind: 'invalid',
      message: 'Invalid port: 70000',
    });
  });

  it.each([
    '--export',
    '--export=-',
    '--export=out.json',
  ])('rejects the removed %s flag instead of silently serving', (flag) => {
    const plan = planStudio([flag, '--config', 'demo.extract.json'], {
      config: 'demo.extract.json',
    });
    expect(plan).toEqual({
      kind: 'invalid',
      message: expect.stringContaining('--export was removed'),
    });
  });

  // 旧 studio は zelt.config.ts を受けていた。同じ引数で呼ばれたときに
  // 「JSON として読めない」ではなく廃止を伝える
  it.each([
    'zelt.config.ts',
    'zelt.config.mts',
    'studio.config.js',
  ])('rejects %s with the removed-format message', (configFile) => {
    const plan = planStudio([], { config: configFile });
    expect(plan.kind).toBe('invalid');
    expect(plan.kind === 'invalid' && plan.message).toContain('zelt.config.ts based studio');
  });
});

describe('runServe', () => {
  it('starts the server with the extracted snapshot and opens the browser when asked', async () => {
    const runtime = makeRuntime();
    const startServer = vi.fn().mockResolvedValue(startedServer);
    const openBrowser = vi.fn();

    const server = await runServe('/cwd', { ...servePlan, open: true }, runtime, {
      extractSnapshotJson: () =>
        Promise.resolve({
          kind: 'extracted' as const,
          json: emptySnapshotJson,
          output: '/cwd/out.json',
          reports: [],
          ignoreRecommendations: [],
        }),
      startServer,
      openBrowser,
      locateStudioUi: () => '/static',
    });

    expect(server).toBe(startedServer);
    expect(startServer).toHaveBeenCalledWith({
      port: 4400,
      staticDir: '/static',
      snapshotJson: emptySnapshotJson,
    });
    expect(openBrowser).toHaveBeenCalledWith(startedServer.url);
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });

  it('does not open the browser unless --open was passed', async () => {
    const runtime = makeRuntime();
    const openBrowser = vi.fn();
    await runServe('/cwd', servePlan, runtime, {
      extractSnapshotJson: () =>
        Promise.resolve({
          kind: 'extracted' as const,
          json: emptySnapshotJson,
          output: '/cwd/out.json',
          reports: [],
          ignoreRecommendations: [],
        }),
      startServer: () => Promise.resolve(startedServer),
      openBrowser,
      locateStudioUi: () => '/static',
    });
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('resolves --config against the cwd', async () => {
    const runtime = makeRuntime();
    const extractSnapshotJson = vi.fn().mockResolvedValue({
      kind: 'extracted',
      json: emptySnapshotJson,
      output: '/cwd/out.json',
      reports: [],
      ignoreRecommendations: [],
    });
    await runServe('/cwd', { ...servePlan, configFile: 'a/demo.extract.json' }, runtime, {
      extractSnapshotJson,
      startServer: () => Promise.resolve(startedServer),
      locateStudioUi: () => '/static',
    });
    expect(extractSnapshotJson).toHaveBeenCalledWith(
      '/cwd/a/demo.extract.json',
      expect.objectContaining({ allowIncomplete: false }),
    );
  });

  it('exits 1 without starting the server when extraction fails', async () => {
    const runtime = makeRuntime();
    const startServer = vi.fn();

    const server = await runServe('/cwd', servePlan, runtime, {
      extractSnapshotJson: () =>
        Promise.resolve({
          kind: 'failed' as const,
          phase: 'assembly' as const,
          diagnostics: ['required-feature-missing: zelt/routes'],
        }),
      startServer,
      locateStudioUi: () => '/static',
    });

    expect(server).toBeUndefined();
    expect(startServer).not.toHaveBeenCalled();
    expect(runtime.setExitCode).toHaveBeenCalledWith(1);
  });

  it('reports EADDRINUSE as a friendly error instead of throwing', async () => {
    const runtime = makeRuntime();
    const bindError = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });

    await expect(
      runServe('/cwd', servePlan, runtime, {
        extractSnapshotJson: () =>
          Promise.resolve({
            kind: 'extracted' as const,
            json: emptySnapshotJson,
            output: '/cwd/out.json',
            reports: [],
            ignoreRecommendations: [],
          }),
        startServer: () => Promise.reject(bindError),
        locateStudioUi: () => '/static',
      }),
    ).resolves.toBeUndefined();

    expect(runtime.setExitCode).toHaveBeenCalledWith(1);
  });

  it('propagates non-EADDRINUSE bind failures', async () => {
    const runtime = makeRuntime();
    await expect(
      runServe('/cwd', servePlan, runtime, {
        extractSnapshotJson: () =>
          Promise.resolve({
            kind: 'extracted' as const,
            json: emptySnapshotJson,
            output: '/cwd/out.json',
            reports: [],
            ignoreRecommendations: [],
          }),
        startServer: () => Promise.reject(new Error('unexpected')),
        locateStudioUi: () => '/static',
      }),
    ).rejects.toThrow('unexpected');
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });

  it('exits 1 when the installation has no bundled studio UI', async () => {
    const runtime = makeRuntime();
    const extractSnapshotJson = vi.fn();
    const server = await runServe('/cwd', servePlan, runtime, {
      extractSnapshotJson,
      locateStudioUi: () => undefined,
    });
    expect(server).toBeUndefined();
    expect(extractSnapshotJson).not.toHaveBeenCalled();
    expect(runtime.setExitCode).toHaveBeenCalledWith(1);
  });
});

describe('runExtract', () => {
  it('resolves --config and --output against the cwd', async () => {
    const runtime = makeRuntime();
    const extract = vi.fn().mockResolvedValue({
      kind: 'published',
      snapshotId: 'a'.repeat(64),
      output: '/cwd/b/out.json',
      reports: [],
      ignoreRecommendations: [],
    });
    await runExtract(
      '/cwd',
      { ...extractPlan, configFile: 'a/demo.extract.json', output: 'b/out.json' },
      runtime,
      { extract },
    );

    expect(extract).toHaveBeenCalledWith(
      '/cwd/a/demo.extract.json',
      expect.objectContaining({ output: '/cwd/b/out.json', allowIncomplete: false }),
    );
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });

  it('leaves the output path to the config when --output is absent', async () => {
    const runtime = makeRuntime();
    const extract = vi.fn().mockResolvedValue({
      kind: 'published',
      snapshotId: 'b'.repeat(64),
      output: '/repo/out.json',
      reports: [],
      ignoreRecommendations: [],
    });
    await runExtract('/cwd', extractPlan, runtime, { extract });

    // zeltEntryPath は CLI の実体の位置から決まるので、値そのものは問わない
    expect(extract).toHaveBeenCalledWith(
      '/cwd/demo.extract.json',
      expect.objectContaining({ allowIncomplete: false }),
    );
    expect(extract).not.toHaveBeenCalledWith(
      '/cwd/demo.extract.json',
      expect.objectContaining({ output: expect.anything() }),
    );
  });

  it('exits 1 when extraction fails', async () => {
    const runtime = makeRuntime();
    const extract = vi.fn().mockResolvedValue({
      kind: 'failed',
      phase: 'assembly',
      diagnostics: ['boom'],
    });
    await runExtract('/cwd', extractPlan, runtime, { extract });

    expect(runtime.setExitCode).toHaveBeenCalledWith(1);
  });
});

// runServe の既定のポートだけを使い、何も注入しない。cli 本体が「app を読み込む子プロセスの
// entry」と「同梱 UI の位置」を自力で解決できているかは、ここでしか確かめられない
// (fixture の required に zelt/routes を入れてあるので、entry を取り違えると抽出が失敗する)
describe('zelt studio (serve, end to end)', () => {
  it('extracts the fixture app and serves it with the studio UI', async () => {
    const runtime = makeRuntime();
    let server: StudioServer | undefined;
    try {
      server = await runServe(
        process.cwd(),
        { ...servePlan, configFile: FIXTURE_CONFIG, port: 0 },
        runtime,
      );
      expect(runtime.setExitCode).not.toHaveBeenCalled();
      expect(server).toBeDefined();
      if (server === undefined) return;

      const origin = `http://127.0.0.1:${server.address.port}`;
      const snapshot: unknown = await (await fetch(`${origin}/snapshot.json`)).json();
      expect(snapshot).toMatchObject({ schemaVersion: 1, project: { id: 'studio-app' } });
      expect(await (await fetch(`${origin}/`)).text()).toContain('<div id="root"></div>');
    } finally {
      await server?.close();
    }
  }, 180_000);
});
