import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { safeParse } from 'valibot';

import type { ZeltInspection, ZeltInspectRequest } from './zelt-inspect-protocol';
import { ZELT_INSPECT_MARKER, ZeltInspectionSchema } from './zelt-inspect-protocol';

export type InspectResult =
  | { ok: true; readonly inspection: ZeltInspection }
  | { ok: false; readonly errorOutput: string };

const parseInspection = (markerLine: string): InspectResult => {
  const parsed: unknown = JSON.parse(markerLine.slice(ZELT_INSPECT_MARKER.length));
  const checked = safeParse(ZeltInspectionSchema, parsed);
  if (!checked.success) {
    const issues = checked.issues
      .map((issue) => `${(issue.path ?? []).map((p) => String(p.key)).join('.')}: ${issue.message}`)
      .join('\n');
    return { ok: false, errorOutput: `the zelt inspection has an unexpected shape\n${issues}` };
  }
  return { ok: true, inspection: checked.output };
};

export const parseInspectOutput = (
  exitCode: number | null,
  stdout: string,
  stderr: string,
): InspectResult => {
  if (exitCode !== 0) {
    return { ok: false, errorOutput: stderr.trim() !== '' ? stderr : stdout };
  }
  // ユーザーコードが偶然 marker 文字列を出力した場合に備え、最後の marker 行を採用する
  const markerLine = stdout
    .split('\n')
    .filter((line) => line.startsWith(ZELT_INSPECT_MARKER))
    .at(-1);
  if (markerLine === undefined) {
    return {
      ok: false,
      errorOutput: `the zelt inspector exited successfully but produced no output.\n${stderr}`,
    };
  }
  return parseInspection(markerLine);
};

const require_ = createRequire(import.meta.url);

// tsx を PATH ではなく自パッケージの runtime dependency から解決する
const resolveTsxCli = (): string => require_.resolve('tsx/cli');

/** build 後は studio.command.ts が dist の entry を渡す。開発時は隣の source を使う */
export const defaultInspectEntry = (): string =>
  fileURLToPath(new URL('./zelt-inspect-entry.ts', import.meta.url));

// dev-server.lib.ts の KILL_TIMEOUT_MS と同じ猶予
const KILL_GRACE_MS = 3000;

// tsx CLI は実行用の node 孫プロセスを spawn し、SIGTERM をそちらへ転送する。
// SIGKILL は転送不能で wrapper だけが死ぬため、SIGTERM 起点で止めて猶予後に pipe を閉じる
const scheduleTimeoutKill = (
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs: number,
  onTimeout: () => void,
): { readonly clear: () => void } => {
  let forceKillTimer: NodeJS.Timeout | undefined;
  const timer = setTimeout(() => {
    onTimeout();
    child.kill('SIGTERM');
    forceKillTimer = setTimeout(() => {
      child.kill('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
    }, KILL_GRACE_MS);
  }, timeoutMs);
  return {
    clear: () => {
      clearTimeout(timer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
    },
  };
};

export type RunInspectOptions = {
  readonly request: ZeltInspectRequest;
  readonly entryPath: string;
  readonly timeoutMs: number;
};

const spawnZeltInspect = (options: RunInspectOptions): Promise<InspectResult> =>
  new Promise((resolvePromise) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(
        process.execPath,
        [resolveTsxCli(), options.entryPath, JSON.stringify(options.request)],
        {
          cwd: options.request.root,
          stdio: ['ignore', 'pipe', 'pipe'],
          // c12(jiti) の独自キャッシュで app が二重評価されると class の identity が
          // 割れて逆引きが壊れる。tsx 配下では native import が TS を扱えるため優先させる
          env: { ...process.env, JITI_TRY_NATIVE: process.env['JITI_TRY_NATIVE'] ?? 'true' },
        },
      );
    } catch (error) {
      resolvePromise({ ok: false, errorOutput: String(error) });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const killer = scheduleTimeoutKill(child, options.timeoutMs, () => {
      timedOut = true;
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      killer.clear();
      if (timedOut) {
        const suffix = stderr.trim() !== '' ? `\n${stderr}` : '';
        resolvePromise({
          ok: false,
          errorOutput: `the zelt inspector timed out after ${options.timeoutMs}ms${suffix}`,
        });
        return;
      }
      resolvePromise(parseInspectOutput(code, stdout, stderr));
    });
    child.on('error', (error) => {
      killer.clear();
      resolvePromise({ ok: false, errorOutput: String(error) });
    });
  });

/** app を読み込む子プロセスを起動し、JSON を受け取る(付録D) */
export const runZeltInspect = async (options: RunInspectOptions): Promise<InspectResult> => {
  // entry を取り違えたときは tsx の起動失敗として現れ、原因が読み取れない。
  // 「entry が無い」ことは spawn する前に名指しで報告する
  if (!existsSync(options.entryPath)) {
    return {
      ok: false,
      errorOutput: `the zelt inspector entry does not exist: ${options.entryPath}`,
    };
  }
  return spawnZeltInspect(options);
};
