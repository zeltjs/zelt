import { describe, expect, it } from 'vitest';
import type { StudioEvent } from './events.types';
import { fixture } from './fixture.lib';
import { transition } from './mediator.lib';
import { present } from './presenter.lib';
import { scopeRelations } from './scope.lib';
import { initialReady, urlState } from './state.lib';
import type { ReadyState } from './state.types';

const graph = fixture();
function ready(state: ReadyState, event: StudioEvent): ReadyState {
  const result = transition(state, event).state;
  if (result.phase !== 'ready') throw new Error('Unexpected state');
  expect(result.notice).toBeNull();
  return result;
}
describe('Mediator transitions', () => {
  it('selects + recurses + locks an entry atomically', () => {
    const before = initialReady(graph, 1);
    const result = transition(before, {
      type: 'entry.choose',
      id: 'entry:ProductController.create',
    });
    expect(result.effects).toEqual([
      {
        type: 'url.write',
        value: {
          node: 'ProductController.create',
          root: 'ProductController.create',
          mode: 'flow',
          tab: 'contract',
        },
      },
    ]);
    expect(before.view.node).toBeNull();
  });
  it.each([
    'near',
    'flow',
    'all',
  ] as const)('keeps %s locked scope during every detail selection', (mode) => {
    let state = ready(initialReady(graph, 1), { type: 'subject.select', id: 'OrderService' });
    state = ready(state, { type: 'scope.mode', mode });
    state = ready(state, { type: 'scope.lock', locked: true });
    const expected = scopeRelations(graph, state.view);
    for (const id of graph.owners.keys()) {
      const next = ready(state, { type: 'subject.select', id });
      expect(next.view.node).toBe(id);
      expect(scopeRelations(graph, next.view)).toEqual(expected);
    }
  });
  it('unlocks to the current detail and does not clear the selected source tab', () => {
    let state = ready(initialReady(graph, 1), { type: 'scope.start', id: 'OrderService' });
    state = ready(state, { type: 'subject.select', id: 'JwtService' });
    state = ready(state, { type: 'inspector.tab', tab: 'source' });
    state = ready(state, { type: 'scope.lock', locked: false });
    expect(state.view.scope).toEqual({ kind: 'following', mode: 'flow' });
    expect(state.view.node).toBe('JwtService');
    expect(state.view.tab).toBe('source');
  });
  it('rejects invalid requests without partial state changes', () => {
    const state = initialReady(graph, 1);
    for (const event of [
      { type: 'scope.lock', locked: true },
      { type: 'scope.start', id: 'createEcApp' },
      { type: 'subject.select', id: 'missing' },
    ] satisfies StudioEvent[]) {
      const result = transition(state, event);
      expect(result.state).toMatchObject({ view: state.view, graph });
      expect(result.state).not.toMatchObject({ notice: null });
      expect(result.effects).toEqual([]);
    }
  });
  it('restores URL state without writing another history entry', () => {
    const value = {
      node: 'JwtService.sign',
      root: 'OrderService',
      mode: 'flow',
      tab: 'source',
    } as const;
    const result = transition(initialReady(graph, 1), { type: 'url.restore', value });
    if (result.state.phase !== 'ready') throw new Error('Not ready');
    expect(urlState(result.state.view)).toEqual(value);
    expect(result.state.view.expanded).toContain('JwtService');
    expect(result.effects).toEqual([]);
    const invalid = transition(result.state, {
      type: 'url.restore',
      value: { ...value, node: 'gone' },
    });
    expect(invalid.state).toMatchObject({ view: result.state.view });
    expect(invalid.effects).toEqual([]);
  });
  it('restores reference navigation, options, folds, lock and viewport', () => {
    let before = ready(initialReady(graph, 1), { type: 'scope.start', id: 'OrderService' });
    before = ready(before, {
      type: 'viewport.observed',
      value: { zoom: 0.7, rect: { x: 60, y: 140, width: 900, height: 600 } },
    });
    const jumped = ready(before, { type: 'reference.jump', id: 'JwtConfig.secret' });
    const restored = ready(jumped, { type: 'reference.back' });
    expect(restored.view).toEqual(before.view);
    expect(restored.command).toMatchObject({ kind: 'restore', viewport: before.viewport });
  });
  it('keeps stale load responses from replacing the active graph', () => {
    const state = initialReady(graph, 2);
    expect(
      transition(state, { type: 'snapshot.failed', requestId: 1, message: 'late' }).state,
    ).toBe(state);
    expect(transition(state, { type: 'snapshot.loaded', requestId: 2, graph }).state).toBe(state);
  });
  it('surfaces failure and refuses user operations while loading', () => {
    const failed = transition(
      { phase: 'loading', requestId: 1 },
      { type: 'snapshot.failed', requestId: 1, message: 'HTTP 503' },
    );
    expect(present(failed.state)).toEqual({ phase: 'error', requestId: 1, message: 'HTTP 503' });
    const blocked = transition(
      { phase: 'loading', requestId: 1 },
      { type: 'subject.select', id: 'OrderService' },
    );
    expect(blocked.state.phase).toBe('error');
  });
});
