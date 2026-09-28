import { describe, expect, it } from 'vitest';
import { present } from './presenter.lib';
import type { ReadyModel } from './presenter.types';
import { declaration, graphOf, group } from './snapshot-builder.lib';
import { initialReady, select, startScope } from './state.lib';
import type { ReadyState } from './state.types';

const groupId = '["class","src/order.controller.ts","OrderController"]';
const createId = `${groupId}#create`;
const graph = graphOf([
  group(
    groupId,
    [
      declaration(createId, {
        name: 'create',
        hints: [{ provider: 'zelt', label: 'POST /api/orders' }],
      }),
      declaration(`${groupId}#list`, { name: 'list' }),
    ],
    { name: 'OrderController' },
  ),
]);

function ready(state: ReadyState): ReadyModel {
  const model = present(state);
  if (model.phase !== 'ready') throw new Error('Not ready');
  return model;
}
function search(query: string): ReadyModel['toolbar']['results'] {
  const state = initialReady(graph, 1);
  return ready({ ...state, view: { ...state.view, query } }).toolbar.results;
}

describe('screen strings use names and hints, never identities', () => {
  it('shows declarations as Group#name with their hints and groups by name alone', () => {
    const create = { id: createId, label: 'OrderController#create', hint: 'POST /api/orders' };
    const list = { id: `${groupId}#list`, label: 'OrderController#list', hint: 'method' };
    expect(search('create')).toEqual([create]);
    expect(search('post /api')).toEqual([create]);
    expect(search('list')).toEqual([list]);
    expect(search('ordercontroller')).toEqual([
      { id: groupId, label: 'OrderController', hint: 'class' },
      create,
      list,
    ]);
    expect(search('OrderController#create')).toEqual([create]);
  });
  it('never matches identities', () => {
    expect(search('["class"')).toEqual([]);
    expect(search('src/order.controller.ts#')).toEqual([]);
  });
  it('names the followed and locked origins', () => {
    const selected = select(initialReady(graph, 1), groupId);
    expect(ready(selected).controls.scopeStatus).toBe('選択に追従: OrderController');
    const locked = startScope(initialReady(graph, 1), createId);
    expect(ready(locked).controls.scopeStatus).toBe('固定基準: create · クリックは詳細のみ');
    expect(ready(locked).graph.summary).toBe('詳細の選択: create');
    expect(ready(locked).inspector).toMatchObject({ id: createId, name: 'create' });
  });
  it('offers neither origin shortcuts nor demo scenarios', () => {
    const model = ready(initialReady(graph, 1));
    expect(model).not.toHaveProperty('demo');
    expect(model.toolbar).not.toHaveProperty('entries');
    expect(model.toolbar).not.toHaveProperty('category');
  });
});
