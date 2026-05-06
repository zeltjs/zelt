import { existsSync, rmSync } from 'node:fs';

import { afterAll, describe, expect, it } from 'vitest';

import { app } from '../app';

type Todo = { id: number; title: string; completed: boolean };

const appFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  app.fetch(new Request(input, init));

const baseUrl = 'https://example.local';

describe('TodoController (e2e)', () => {
  afterAll(() => {
    if (existsSync('./data/todo.db')) {
      rmSync('./data/todo.db');
    }
  });

  describe('POST /todos', () => {
    it('creates a todo', async () => {
      const res = await appFetch(`${baseUrl}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Buy milk' }),
      });

      expect(res.status).toBe(201);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body: Todo = await res.json();
      expect(body).toMatchObject({ title: 'Buy milk', completed: false });
    });
  });

  describe('GET /todos', () => {
    it('lists all todos', async () => {
      const res = await appFetch(`${baseUrl}/todos`);

      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body: Todo[] = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /todos/:id', () => {
    it('gets a todo by id', async () => {
      const createRes = await appFetch(`${baseUrl}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test todo' }),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const created: Todo = await createRes.json();

      const res = await appFetch(`${baseUrl}/todos/${created.id}`);

      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body: Todo = await res.json();
      expect(body.title).toBe('Test todo');
    });

    it('returns 404 for non-existent todo', async () => {
      const res = await appFetch(`${baseUrl}/todos/99999`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /todos/:id', () => {
    it('updates a todo', async () => {
      const createRes = await appFetch(`${baseUrl}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Original title' }),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const created: Todo = await createRes.json();

      const res = await appFetch(`${baseUrl}/todos/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated title', completed: true }),
      });

      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body: Todo = await res.json();
      expect(body.title).toBe('Updated title');
      expect(body.completed).toBe(true);
    });
  });

  describe('DELETE /todos/:id', () => {
    it('deletes a todo', async () => {
      const createRes = await appFetch(`${baseUrl}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'To be deleted' }),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const created: Todo = await createRes.json();

      const res = await appFetch(`${baseUrl}/todos/${created.id}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(204);

      const getRes = await appFetch(`${baseUrl}/todos/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });
});
