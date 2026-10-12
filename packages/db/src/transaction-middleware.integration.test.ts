import type { Next } from '@zeltjs/core';
import {
  Controller,
  createApp,
  ErrorHandler,
  Get,
  http,
  Injectable,
  inject,
  Middleware,
  request,
  TaskService,
  UseMiddleware,
} from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseService } from './database.service';
import { createTransactionMiddleware } from './transaction.middleware';

type Client = { readonly kind: 'base' | 'transaction'; active: boolean };

@Injectable()
class MemoryDatabase extends DatabaseService<Client> {
  readonly transactions: Client[] = [];

  setup(): Promise<{ client: Client }> {
    return Promise.resolve({ client: { kind: 'base', active: true } });
  }

  async transaction<T>(_client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
    const tx: Client = { kind: 'transaction', active: true };
    this.transactions.push(tx);
    try {
      return await fn(tx);
    } finally {
      tx.active = false;
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

describe('transaction middleware request scope', () => {
  it('uses the base client in error handlers after an upstream post-processing failure', async () => {
    const failure = new Error('post-processing failed');

    const Transaction = createTransactionMiddleware(MemoryDatabase);

    @Middleware
    class PostProcessing {
      async use(next: Next): Promise<undefined> {
        await next();
        throw failure;
      }
    }

    @ErrorHandler
    class Errors {
      constructor(private db = inject(MemoryDatabase)) {}

      onError(error: Error) {
        expect(error).toBe(failure);
        expect(this.db.transactions).toHaveLength(1);
        expect(this.db.transactions[0]?.active).toBe(false);
        return Response.json(this.db.client, { status: 503 });
      }
    }

    @Controller('/')
    @UseMiddleware(Transaction)
    class Endpoint {
      constructor(private db = inject(MemoryDatabase)) {}

      @Get('/')
      async handle() {
        expect(this.db.client).toEqual({ kind: 'transaction', active: true });
        await Promise.resolve();
        expect(this.db.client).toEqual({ kind: 'transaction', active: true });
        return { ok: true };
      }
    }

    const runtime = await createApp([
      http({ controllers: [Endpoint], middlewares: [PostProcessing], errorHandlers: [Errors] }),
    ]).createRuntime({ contextMode: 'async' });
    try {
      const result = await runtime.http.request('/');
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ kind: 'base', active: true });
    } finally {
      await runtime.shutdown();
    }
  });

  it.each([
    false,
    true,
  ])('uses the base client in afterResponse tasks, handler fails=%s', async (fails) => {
    const observed: { id: string; before: Client; after: Client }[] = [];
    const Transaction = createTransactionMiddleware(MemoryDatabase);

    @ErrorHandler
    class Errors {
      onError(error: Error) {
        return Response.json({ error: error.message }, { status: 503 });
      }
    }

    @Controller('/')
    @UseMiddleware(Transaction)
    class Endpoint {
      constructor(
        private db = inject(MemoryDatabase),
        private tasks = inject(TaskService),
      ) {}

      @Get('/:id')
      async handle() {
        expect(this.db.client).toEqual({ kind: 'transaction', active: true });
        this.tasks.afterResponse(async () => {
          const before = { ...this.db.client };
          await Promise.resolve();
          observed.push({ id: request().pathParam('id'), before, after: { ...this.db.client } });
        });
        await Promise.resolve();
        if (fails) throw new Error('handler failed');
        return { ok: true };
      }
    }

    const runtime = await createApp([
      http({ controllers: [Endpoint], errorHandlers: [Errors] }),
    ]).createRuntime({ contextMode: 'async', warmup: true });
    try {
      const ids = ['a', 'b', 'c'];
      const results = await Promise.all(ids.map((id) => runtime.http.request(`/${id}`)));
      for (const result of results) {
        const payload = await result.json();
        expect(result.status, JSON.stringify(payload)).toBe(fails ? 503 : 200);
        expect(payload).toEqual(fails ? { error: 'handler failed' } : { ok: true });
      }
      await vi.waitFor(() => expect(observed).toHaveLength(ids.length));
      expect(observed).toEqual(
        expect.arrayContaining(
          ids.map((id) => ({
            id,
            before: { kind: 'base', active: true },
            after: { kind: 'base', active: true },
          })),
        ),
      );
      const db = await runtime.get(MemoryDatabase);
      expect(db.transactions).toHaveLength(ids.length);
      expect(db.transactions.every((tx) => !tx.active)).toBe(true);
    } finally {
      await runtime.shutdown();
    }
  });
});
