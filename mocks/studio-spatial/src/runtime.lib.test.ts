import { describe, expect, it, vi } from 'vitest';
import type { EventSink } from './events.types';
import { fixture } from './fixture.lib';
import type { RootModel } from './presenter.types';
import { mountStudio } from './runtime.lib';
import { decodeUrl, encodeUrl } from './url.lib';

function harness(url = 'https://example.test/studio/') {
  const renders: RootModel[] = [];
  let send: EventSink = () => {
    throw new Error('Not mounted');
  };
  let pop = () => {};
  const unsubscribe = vi.fn();
  const fetchSnapshot = vi.fn(async (_signal: AbortSignal): Promise<unknown> => fixture().snapshot);
  const writeUrl = vi.fn((next: string) => {
    url = next;
  });
  const ports = {
    render: (model: RootModel, emit: EventSink) => {
      renders.push(model);
      send = emit;
    },
    fetchSnapshot,
    readUrl: () => url,
    writeUrl,
    onPopState: (restore: () => void) => {
      pop = restore;
      return unsubscribe;
    },
  };
  return {
    ports,
    renders,
    unsubscribe,
    send: (event: Parameters<EventSink>[0]) => send(event),
    pop: (next: string) => {
      url = next;
      pop();
    },
  };
}

describe('runtime IO boundaries', () => {
  it('restores nuqs URL values without echoing browser history', async () => {
    const app = harness(
      'https://example.test/studio/?node=JwtService.sign&root=OrderService&mode=flow&tab=source',
    );
    const dispose = mountStudio(app.ports);
    await vi.waitFor(() =>
      expect(app.renders.at(-1)).toMatchObject({ phase: 'ready', tab: 'source' }),
    );
    expect(app.ports.writeUrl).not.toHaveBeenCalled();
    app.send({ type: 'subject.select', id: 'ProductController' });
    expect(app.ports.writeUrl).toHaveBeenCalledTimes(1);
    app.pop('https://example.test/studio/?node=JwtService.sign');
    expect(app.ports.writeUrl).toHaveBeenCalledTimes(1);
    expect(app.renders.at(-1)).toMatchObject({
      inspector: { id: 'JwtService.sign' },
      controls: { locked: false },
    });
    dispose();
    expect(app.unsubscribe).toHaveBeenCalledOnce();
  });
  it('aborts and refuses late results after unmount', async () => {
    const app = harness();
    let resolve: (value: unknown) => void = () => {
      throw new Error('Promise not initialized');
    };
    const pending = new Promise<unknown>((done) => {
      resolve = done;
    });
    app.ports.fetchSnapshot.mockReturnValue(pending);
    const dispose = mountStudio(app.ports);
    const signal = app.ports.fetchSnapshot.mock.calls[0]?.[0];
    dispose();
    expect(signal?.aborted).toBe(true);
    resolve(fixture().snapshot);
    await pending;
    expect(app.renders).toEqual([{ phase: 'loading', requestId: 1 }]);
  });
  it.each([
    new Error('HTTP 503'),
    { schemaVersion: 999 },
  ])('shows fetch/schema failures: %s', async (failure) => {
    const app = harness();
    if (failure instanceof Error) app.ports.fetchSnapshot.mockRejectedValue(failure);
    else app.ports.fetchSnapshot.mockResolvedValue(failure);
    const dispose = mountStudio(app.ports);
    await vi.waitFor(() => expect(app.renders.at(-1)).toMatchObject({ phase: 'error' }));
    expect(app.ports.writeUrl).not.toHaveBeenCalled();
    dispose();
  });
  it('shows history write failure without losing the selected node', async () => {
    const app = harness();
    const dispose = mountStudio(app.ports);
    await vi.waitFor(() => expect(app.renders.at(-1)?.phase).toBe('ready'));
    app.ports.writeUrl.mockImplementation(() => {
      throw new Error('Denied');
    });
    app.send({ type: 'subject.select', id: 'OrderService' });
    expect(app.renders.at(-1)).toMatchObject({
      inspector: { id: 'OrderService' },
      notice: 'URL保存失敗: Denied',
    });
    dispose();
  });
  it('reset removes an invalid URL even when the current view is already default', async () => {
    const app = harness('https://example.test/studio/?node=missing&mode=bad');
    const dispose = mountStudio(app.ports);
    await vi.waitFor(() =>
      expect(app.renders.at(-1)).toMatchObject({ notice: expect.any(String) }),
    );
    app.send({ type: 'view.reset' });
    expect(app.ports.writeUrl).toHaveBeenLastCalledWith('https://example.test/studio/');
    expect(app.renders.at(-1)).toMatchObject({ notice: null });
    dispose();
  });
  it('preserves unrelated parameters and safely encodes declaration identities', () => {
    const state = { node: 'file.ts:foo / bar', root: null, mode: 'near', tab: 'source' } as const;
    const url = encodeUrl('https://example.test/nested/?unrelated=ok#anchor', state);
    expect(decodeUrl(url)).toEqual(state);
    expect(new URL(url).searchParams.get('unrelated')).toBe('ok');
    expect(new URL(url).hash).toBe('#anchor');
    expect(() => decodeUrl('?mode=invalid')).toThrow();
  });
});
