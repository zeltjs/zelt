import { tinyFetch } from '@zeltjs/adapter-tinyjs/renderer';
import type { Task } from './task.types';

const tasksElement = document.querySelector('#tasks');
const form = document.querySelector('#task-form');
const title = document.querySelector('#title');
const summary = document.querySelector('#summary');
const errorElement = document.querySelector('#error');
const connection = document.querySelector('#connection');
const windowTitle = document.querySelector('#window-title');
if (
  !(tasksElement instanceof HTMLUListElement) ||
  !(form instanceof HTMLFormElement) ||
  !(title instanceof HTMLInputElement) ||
  !(summary instanceof HTMLElement) ||
  !(errorElement instanceof HTMLElement) ||
  !(connection instanceof HTMLElement) ||
  !(windowTitle instanceof HTMLButtonElement)
) {
  throw new Error('タスク画面の構成が不正です');
}

const api = async (path: string, init?: RequestInit): Promise<Response> => {
  const result = await tinyFetch(path, init);
  if (!result.ok) throw new Error(`操作に失敗しました（HTTP ${result.status}）`);
  return result;
};

const report = (error: unknown): void => {
  errorElement.hidden = false;
  errorElement.textContent = error instanceof Error ? error.message : String(error);
};

const render = async (): Promise<void> => {
  const result: { tasks: Task[] } = await (await api('/api/tasks')).json();
  tasksElement.replaceChildren();
  summary.textContent = `${result.tasks.filter((task) => task.done).length} / ${result.tasks.length} 完了`;
  for (const task of result.tasks) {
    const item = document.createElement('li');
    item.classList.toggle('done', task.done);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', `${task.title}を${task.done ? '未完了' : '完了'}にする`);
    checkbox.addEventListener('change', () => {
      void api(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: checkbox.checked }),
      })
        .then(render)
        .catch(report);
    });
    const text = document.createElement('span');
    text.textContent = task.title;
    const remove = document.createElement('button');
    remove.textContent = '削除';
    remove.className = 'remove';
    remove.setAttribute('aria-label', `${task.title}を削除`);
    remove.addEventListener('click', () => {
      void api(`/api/tasks/${task.id}`, { method: 'DELETE' }).then(render).catch(report);
    });
    item.append(checkbox, text, remove);
    tasksElement.append(item);
  }
};

form.addEventListener('submit', (event) => {
  event.preventDefault();
  errorElement.hidden = true;
  void api('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.value }),
  })
    .then(async () => {
      title.value = '';
      await render();
      title.focus();
    })
    .catch(report);
});

windowTitle.addEventListener('click', () => {
  void api('/api/window/title', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '今日のタスク — Zelt × tinyjs' }),
  })
    .then(() => {
      windowTitle.textContent = 'ウィンドウ名を更新しました';
    })
    .catch(report);
});

void api('/api/status')
  .then(async () => {
    connection.textContent = 'バックエンド接続済み';
    await render();
  })
  .catch(report);
