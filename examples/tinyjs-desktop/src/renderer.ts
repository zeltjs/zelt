import { tinyFetch } from '@zeltjs/adapter-tinyjs/renderer';
import { hc } from 'hono/client';
import type { AppType } from '../generated/app-type';

const client = hc<AppType>('http://zelt-tinyjs', { fetch: tinyFetch });

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

const checkResponse = <T extends Response>(result: T): T => {
  if (!result.ok) throw new Error(`操作に失敗しました（HTTP ${result.status}）`);
  return result;
};

const report = (error: unknown): void => {
  errorElement.hidden = false;
  errorElement.textContent = error instanceof Error ? error.message : String(error);
};

const render = async (): Promise<void> => {
  const result = await client.api.tasks
    .$get()
    .then(checkResponse)
    .then((res) => res.json());
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
      void client.api.tasks[':id']
        .$patch({
          param: { id: String(task.id) },
          json: { done: checkbox.checked },
        })
        .then(checkResponse)
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
      void client.api.tasks[':id']
        .$delete({ param: { id: String(task.id) } })
        .then(checkResponse)
        .then(render)
        .catch(report);
    });
    item.append(checkbox, text, remove);
    tasksElement.append(item);
  }
};

form.addEventListener('submit', (event) => {
  event.preventDefault();
  errorElement.hidden = true;
  void client.api.tasks
    .$post({ json: { title: title.value } })
    .then(checkResponse)
    .then(async () => {
      title.value = '';
      await render();
      title.focus();
    })
    .catch(report);
});

windowTitle.addEventListener('click', () => {
  void client.api.window.title
    .$post({ json: { title: '今日のタスク — Zelt × tinyjs' } })
    .then(checkResponse)
    .then(() => {
      windowTitle.textContent = 'ウィンドウ名を更新しました';
    })
    .catch(report);
});

void client.api.status
  .$get()
  .then(checkResponse)
  .then(async () => {
    connection.textContent = 'バックエンド接続済み';
    await render();
  })
  .catch(report);
