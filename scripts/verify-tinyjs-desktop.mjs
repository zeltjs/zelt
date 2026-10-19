import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = path.join(root, '.tmp');
await mkdir(temporaryRoot, { recursive: true });
const temporary = await mkdtemp(path.join(temporaryRoot, 'zelt-tinyjs-verify-'));
const binary = process.env.TINYJS_BIN ?? 'tinyjs';
const packaged = process.argv.includes('--packaged');
let child;
try {
  const example = path.join(root, 'examples/tinyjs-desktop');
  await cp(path.join(example, 'backend'), path.join(temporary, 'backend'), { recursive: true });
  await cp(path.join(example, 'frontend'), path.join(temporary, 'frontend'), { recursive: true });
  await mkdir(path.join(temporary, 'src'));
  const config = JSON.parse(await readFile(path.join(example, 'tinyjs.json'), 'utf8'));
  config.name = 'zelt-tinyjs-verification';
  await writeFile(path.join(temporary, 'tinyjs.json'), JSON.stringify(config));
  await cp(path.join(temporary, 'backend/main.js'), path.join(temporary, 'backend/application.js'));
  await writeFile(path.join(temporary, 'backend/main.js'), `
import * as application from './application.js';
export const init = application.init;
export const api = { ...application.api, 'verification.report': async (result, native) => {
  console.log('ZELT_NATIVE_RESULT ' + JSON.stringify(result));
  await native.quit();
  return true;
}};
`);
  const html = await readFile(path.join(temporary, 'frontend/index.html'), 'utf8');
  await writeFile(path.join(temporary, 'frontend/index.html'), html.replace('</body>', '<script type="module" src="./verification.js"></script></body>'));
  await writeFile(path.join(temporary, 'frontend/verification.js'), `
const wait = async (condition) => {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    const error = document.querySelector('#error');
    if (error && !error.hidden) throw new Error(error.textContent);
    if (Date.now() > deadline) throw new Error('Native UI did not reach the expected state');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};
try {
  await wait(() => document.querySelector('#tasks').children.length === 2);
  const input = document.querySelector('#title');
  input.value = 'WebViewから追加したタスク';
  document.querySelector('#task-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await wait(() => [...document.querySelectorAll('#tasks li')].some(item => item.textContent.includes(input.value || 'WebViewから追加したタスク')));
  const item = [...document.querySelectorAll('#tasks li')].find(item => item.textContent.includes('WebViewから追加したタスク'));
  item.querySelector('input').click();
  await wait(() => [...document.querySelectorAll('#tasks li')].some(item => item.classList.contains('done') && item.textContent.includes('WebViewから追加したタスク')));
  [...document.querySelectorAll('#tasks li')].find(item => item.textContent.includes('WebViewから追加したタスク')).querySelector('button').click();
  await wait(() => document.querySelector('#tasks').children.length === 2);
  document.querySelector('#window-title').click();
  await wait(() => document.querySelector('#window-title').textContent.includes('更新しました'));
  await tiny.api.call('verification.report', { ok: true, operations: ['list', 'create', 'update', 'delete', 'native-window-title'] });
} catch (error) {
  await tiny.api.call('verification.report', { ok: false, error: error.message, stack: error.stack });
}
`);
  const environment = {
    ...process.env,
    XDG_DATA_HOME: path.join(temporary, 'native-data'),
    XDG_CONFIG_HOME: path.join(temporary, 'native-config'),
    XDG_CACHE_HOME: path.join(temporary, 'native-cache'),
  };
  if (packaged) await promisify(execFile)(binary, ['build'], { cwd: temporary, env: environment, timeout: 30000 });
  const executable = packaged ? path.join(temporary, 'dist', config.name + (process.platform === 'win32' ? '.exe' : '')) : binary;
  const commandArguments = packaged ? [] : ['dev'];
  const args = process.platform === 'linux'
    ? ['-a', '-s', '-screen 0 1100x800x24', 'dbus-run-session', executable, ...commandArguments]
    : commandArguments;
  child = spawn(process.platform === 'linux' ? 'xvfb-run' : executable, args, {
    cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: environment,
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Native tinyjs verification timed out: ${errors}\n${output}`)), 30000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`tinyjs exited ${code} before reporting: ${errors}\n${output}`)); });
    child.stdout.on('data', data => {
      output += data;
      const line = output.split('\n').slice(0, -1).find(value => value.startsWith('ZELT_NATIVE_RESULT '));
      if (line) { clearTimeout(timeout); resolve(JSON.parse(line.slice('ZELT_NATIVE_RESULT '.length))); }
    });
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.operations, ['list', 'create', 'update', 'delete', 'native-window-title']);
  console.log(`tinyjs ${packaged ? 'packaged app' : 'native WebView'}: task CRUD and native window title passed.`);
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  }
  await rm(temporary, { recursive: true, force: true });
}
