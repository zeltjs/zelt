import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAnalyzer } from './analyzer-runner.lib';

const FIXTURE_DIR = resolve(__dirname, '../../test-fixtures/studio-app');
const ANALYZER_SRC = resolve(__dirname, './analyzer-entry.ts');

describe('studio analyzer (integration)', () => {
  it('builds the dependency graph of the fixture app', async () => {
    const result = await runAnalyzer({ cwd: FIXTURE_DIR, analyzerPath: ANALYZER_SRC });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const classNames = result.graph.nodes.map((n) => n.className).sort();
    expect(classNames).toEqual(['ClockService', 'GreetingController', 'GreetingService']);

    const kinds = Object.fromEntries(result.graph.nodes.map((n) => [n.className, n.kind]));
    expect(kinds['GreetingController']).toBe('controller');
    expect(kinds['GreetingService']).toBe('service');

    const controller = result.graph.nodes.find((n) => n.className === 'GreetingController');
    expect(controller?.featureKey).toBe('http');

    expect(result.graph.edges).toHaveLength(2);
    expect(result.graph.version).toBe(1);
  }, 60_000);

  it('reports load errors via errorOutput', async () => {
    const result = await runAnalyzer({
      cwd: FIXTURE_DIR,
      analyzerPath: ANALYZER_SRC,
      configFile: 'no-such-config.ts',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput.length).toBeGreaterThan(0);
  }, 60_000);

  it('propagates user-code import errors via errorOutput instead of crashing', async () => {
    // broken fixture: app loader が存在しないモジュールを import する
    const result = await runAnalyzer({
      cwd: resolve(__dirname, '../../test-fixtures/studio-app-broken'),
      analyzerPath: ANALYZER_SRC,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput).toContain('no-such-module');
  }, 60_000);
});
