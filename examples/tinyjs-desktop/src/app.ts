import { tinyjsBridge } from '@zeltjs/adapter-tinyjs';
import {
  Controller,
  createApp,
  Delete,
  Get,
  http,
  Injectable,
  inject,
  Patch,
  Post,
  request,
  response,
} from '@zeltjs/core';
import * as v from 'valibot';
import { DesktopAppAdaptor } from './native-app.adaptor';
import type { Task } from './task.types';

const NewTask = v.object({ title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)) });
const TaskUpdate = v.object({ done: v.boolean() });

@Injectable()
class TaskStore {
  tasks: readonly Task[] = [
    { id: 1, title: 'ZeltのAPIをWebViewから呼ぶ', done: true },
    { id: 2, title: '新しいタスクを追加する', done: false },
  ];
  nextId = 3;
}

@Injectable()
class TaskService {
  constructor(private store = inject(TaskStore)) {}
  list(): readonly Task[] {
    return this.store.tasks;
  }
  add(title: string): Task {
    const task: Task = { id: this.store.nextId++, title, done: false };
    this.store.tasks = [...this.store.tasks, task];
    return task;
  }
  update(id: number, done: boolean): Task | undefined {
    const current = this.store.tasks.find((task) => task.id === id);
    if (!current) return undefined;
    const updated = { ...current, done };
    this.store.tasks = this.store.tasks.map((task) => (task.id === id ? updated : task));
    return updated;
  }
  remove(id: number): boolean {
    if (!this.store.tasks.some((task) => task.id === id)) return false;
    this.store.tasks = this.store.tasks.filter((task) => task.id !== id);
    return true;
  }
}

@Controller('/api')
export class TaskController {
  constructor(
    private tasks = inject(TaskService),
    private nativeApp = inject(DesktopAppAdaptor),
  ) {}

  @Get('/status')
  status() {
    return { runtime: 'txiki.js', desktop: 'tinyjs', transport: 'native IPC', context: 'sync' };
  }

  @Get('/tasks')
  list() {
    return { tasks: this.tasks.list() };
  }

  @Post('/tasks')
  async add(req = request(NewTask), res = response()) {
    const input = await req.body();
    return res.json(this.tasks.add(input.title), 201);
  }

  @Patch('/tasks/:id')
  async update(req = request(TaskUpdate), res = response()) {
    const input = await req.body();
    const task = this.tasks.update(Number(req.pathParam('id')), input.done);
    return task ? res.json(task) : res.json({ message: 'タスクが見つかりません' }, 404);
  }

  @Delete('/tasks/:id')
  remove(req = request(), res = response()) {
    return this.tasks.remove(Number(req.pathParam('id')))
      ? res.status(204).empty()
      : res.status(404).json({ message: 'タスクが見つかりません' });
  }

  @Post('/window/title')
  async title(req = request(NewTask)) {
    const input = await req.body();
    await this.nativeApp.native.setTitle(input.title);
    return { title: input.title };
  }
}

export const app = createApp([
  http({ controllers: [TaskController] }),
  tinyjsBridge({ adaptor: DesktopAppAdaptor }),
]);
