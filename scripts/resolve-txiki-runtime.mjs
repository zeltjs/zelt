import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

async function isExecutable(file) {
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(file, constants.X_OK);
    return true;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return false;
    throw error;
  }
}

/**
 * Resolve an executable before bundling or spawning. Explicit TJS_BIN is binding;
 * otherwise prefer PATH tjs, then a tinyjs installation's bundled runtime.
 * Missing/non-executable candidates produce an error result; other I/O errors propagate.
 */
export async function resolveTxikiRuntime({ env = process.env, home = homedir() } = {}) {
  const name = process.platform === 'win32' ? 'tjs.exe' : 'tjs';
  const directories = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const onPath = (command) => directories.map(directory => path.resolve(directory, command));
  if (env.TJS_BIN !== undefined) {
    const candidates = env.TJS_BIN.includes('/') || env.TJS_BIN.includes('\\')
      ? [path.resolve(env.TJS_BIN)]
      : onPath(env.TJS_BIN);
    for (const candidate of candidates) {
      if (env.TJS_BIN && await isExecutable(candidate)) return { ok: true, binary: candidate };
    }
    return { ok: false, error: `TJS_BIN=${JSON.stringify(env.TJS_BIN)} does not identify an executable. Set TJS_BIN to the full path of tjs.` };
  }

  const checked = [];
  async function find(candidates) {
    for (const candidate of candidates) {
      checked.push(candidate);
      if (await isExecutable(candidate)) return candidate;
    }
    return undefined;
  }
  const standalone = await find(onPath(name));
  if (standalone) return { ok: true, binary: standalone };
  if (env.TINYJS_HOME) {
    const bundled = await find([path.resolve(env.TINYJS_HOME, 'bin', name)]);
    if (bundled) return { ok: true, binary: bundled };
  }
  for (const launcher of onPath(process.platform === 'win32' ? 'tinyjs.cmd' : 'tinyjs')) {
    if (!await isExecutable(launcher)) continue;
    const bundled = await find([path.join(path.dirname(await realpath(launcher)), 'bin', name)]);
    if (bundled) return { ok: true, binary: bundled };
  }
  const defaultInstall = await find([path.join(home, '.tinyjs', 'bin', name)]);
  if (defaultInstall) return { ok: true, binary: defaultInstall };
  return {
    ok: false,
    error: `txiki.js executable was not found. Install txiki.js or tinyjs, or run:\n  TJS_BIN=/path/to/tjs pnpm verify:txiki\nChecked:\n${checked.map(file => `  ${file}`).join('\n')}`,
  };
}
