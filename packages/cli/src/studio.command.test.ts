import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeResult, StudioServer } from './studio/index';
import { handleExport, resolvePort, serveStudio } from './studio.command';

const okResult: AnalyzeResult = {
  ok: true,
  graph: { version: 1, nodes: [], edges: [] },
};

const errorResult: AnalyzeResult = { ok: false, errorOutput: 'boom' };

const makeRuntime = () => ({
  setExitCode: vi.fn(),
  writeStdout: vi.fn(),
});

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

describe('handleExport', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'zelt-studio-command-test-'));
  });

  it('writes the graph JSON to stdout when export path is "-"', async () => {
    const runtime = makeRuntime();
    const analyze = vi.fn().mockResolvedValue(okResult);

    const handled = await handleExport(testDir, analyze, '-', runtime);

    expect(handled).toBe(true);
    expect(runtime.writeStdout).toHaveBeenCalledWith(
      `${JSON.stringify(okResult.graph, null, 2)}\n`,
    );
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });

  it('writes the graph JSON to a file when export path is a real path', async () => {
    const runtime = makeRuntime();
    const analyze = vi.fn().mockResolvedValue(okResult);

    const handled = await handleExport(testDir, analyze, 'out.json', runtime);

    expect(handled).toBe(true);
    await expect(readFile(join(testDir, 'out.json'), 'utf8')).resolves.toBe(
      `${JSON.stringify(okResult.graph, null, 2)}\n`,
    );
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });

  it('reports analyzer failure and sets exit code 1 without writing anything', async () => {
    const runtime = makeRuntime();
    const analyze = vi.fn().mockResolvedValue(errorResult);

    const handled = await handleExport(testDir, analyze, '-', runtime);

    expect(handled).toBe(true);
    expect(runtime.setExitCode).toHaveBeenCalledWith(1);
    expect(runtime.writeStdout).not.toHaveBeenCalled();
  });

  it('is not requested when export was never passed (undefined)', async () => {
    const runtime = makeRuntime();
    const analyze = vi.fn().mockResolvedValue(okResult);

    const handled = await handleExport(testDir, analyze, undefined, runtime);

    expect(handled).toBe(false);
    expect(analyze).not.toHaveBeenCalled();
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });

  // Critical regression: `--export -` (space-separated) makes citty parse "-" as
  // "no value" rather than the literal string "-", so args.export becomes "" —
  // identical to what an empty --export= would produce. This must surface as an
  // explicit user error, never silently fall through to starting the server.
  it('treats an empty export value as a usage error, not "no export requested"', async () => {
    const runtime = makeRuntime();
    const analyze = vi.fn().mockResolvedValue(okResult);

    const handled = await handleExport(testDir, analyze, '', runtime);

    expect(handled).toBe(true);
    expect(analyze).not.toHaveBeenCalled();
    expect(runtime.setExitCode).toHaveBeenCalledWith(1);
    expect(runtime.writeStdout).not.toHaveBeenCalled();
  });
});

describe('serveStudio', () => {
  let staticDir: string;

  beforeEach(async () => {
    staticDir = await mkdtemp(join(tmpdir(), 'zelt-studio-command-serve-test-'));
    await mkdir(staticDir, { recursive: true });
  });

  it('starts the server and opens the browser when requested', async () => {
    const runtime = { setExitCode: vi.fn() };
    const server: StudioServer = { url: 'http://localhost:4400', close: vi.fn() };
    const startServer = vi.fn().mockResolvedValue(server);
    const openBrowser = vi.fn();
    const analyze = vi.fn().mockResolvedValue(okResult);

    await serveStudio(analyze, 4400, true, runtime, startServer, openBrowser);

    expect(openBrowser).toHaveBeenCalledWith(server.url);
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });

  it('does not open the browser when not requested', async () => {
    const runtime = { setExitCode: vi.fn() };
    const server: StudioServer = { url: 'http://localhost:4400', close: vi.fn() };
    const startServer = vi.fn().mockResolvedValue(server);
    const openBrowser = vi.fn();
    const analyze = vi.fn().mockResolvedValue(okResult);

    await serveStudio(analyze, 4400, false, runtime, startServer, openBrowser);

    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('reports EADDRINUSE as a friendly error instead of throwing', async () => {
    const runtime = { setExitCode: vi.fn() };
    const bindError = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
    const startServer = vi.fn().mockRejectedValue(bindError);
    const openBrowser = vi.fn();
    const analyze = vi.fn().mockResolvedValue(okResult);

    await expect(
      serveStudio(analyze, 4400, false, runtime, startServer, openBrowser),
    ).resolves.toBeUndefined();

    expect(runtime.setExitCode).toHaveBeenCalledWith(1);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('propagates non-EADDRINUSE bind failures', async () => {
    const runtime = { setExitCode: vi.fn() };
    const startServer = vi.fn().mockRejectedValue(new Error('unexpected'));
    const openBrowser = vi.fn();
    const analyze = vi.fn().mockResolvedValue(okResult);

    await expect(
      serveStudio(analyze, 4400, false, runtime, startServer, openBrowser),
    ).rejects.toThrow('unexpected');
    expect(runtime.setExitCode).not.toHaveBeenCalled();
  });
});
