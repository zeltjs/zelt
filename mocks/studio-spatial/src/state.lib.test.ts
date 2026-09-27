import { describe, expect, it } from 'vitest';
import { transition } from './mediator.lib';
import { declaration, graphOf, group } from './snapshot-builder.lib';
import { initialReady, locate, select } from './state.lib';
import type { ReadyState } from './state.types';

const graph = graphOf(
  [
    group('App', [declaration('App.create', { calls: ['Controller.run'] })], {
      column: 'column:app',
    }),
    group('Controller', [declaration('Controller.run')]),
  ],
  [
    { id: 'column:app', label: 'Composition', initiallyHidden: true },
    { id: 'column:0', label: 'Entry' },
  ],
);

function ready(state: ReadyState, event: Parameters<typeof transition>[1]): ReadyState {
  const next = transition(state, event).state;
  if (next.phase !== 'ready') throw new Error('Not ready');
  expect(next.notice).toBeNull();
  return next;
}

describe('every column toggles the same way, and reaching a hidden subject shows its column', () => {
  it('starts with the configured columns hidden', () => {
    expect(initialReady(graph, 1).view.options.hiddenColumns).toEqual(['column:app']);
  });
  it('shows and hides any column', () => {
    const shown = ready(initialReady(graph, 1), {
      type: 'column.toggle',
      id: 'column:app',
      visible: true,
    });
    expect(shown.view.options.hiddenColumns).toEqual([]);
    const hidden = ready(shown, { type: 'column.toggle', id: 'column:0', visible: false });
    expect(hidden.view.options.hiddenColumns).toEqual(['column:0']);
  });
  it('rejects an unknown column', () => {
    const state = initialReady(graph, 1);
    expect(
      transition(state, { type: 'column.toggle', id: 'nope', visible: false }).state,
    ).toMatchObject({
      view: state.view,
      notice: expect.any(String),
    });
  });
  it('shows the column of a subject that is selected or located', () => {
    expect(select(initialReady(graph, 1), 'App.create').view.options.hiddenColumns).toEqual([]);
    expect(locate(initialReady(graph, 1), 'App').view.options.hiddenColumns).toEqual([]);
  });
  it('can start a locked scope from any subject, including the composition', () => {
    const locked = ready(initialReady(graph, 1), { type: 'scope.start', id: 'App.create' });
    expect(locked.view.scope).toEqual({ kind: 'locked', mode: 'flow', anchor: 'App.create' });
  });
});
