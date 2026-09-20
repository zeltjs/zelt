import { describe, expect, it } from 'vitest';
import { boundary } from './event-chain';
import { fixture } from './fixture.lib';
import { transition } from './mediator.lib';
import { initialReady } from './state.lib';

describe('parent responsibility chain', () => {
  it('visits child, group, viewport and Root once, then reaches the Mediator', () => {
    const route: string[] = [];
    const root = boundary(
      () => {
        route.push('Mediator');
      },
      () => {
        route.push('Root');
        return 'pass';
      },
    );
    const viewport = boundary(root, () => {
      route.push('GraphViewport');
      return 'pass';
    });
    const group = boundary(viewport, () => {
      route.push('GroupNode');
      return 'pass';
    });
    const child = boundary(group, () => {
      route.push('DeclarationNode');
      return 'pass';
    });
    child({ type: 'subject.select', id: 'OrderService' });
    expect(route).toEqual(['DeclarationNode', 'GroupNode', 'GraphViewport', 'Root', 'Mediator']);
  });
  it('stops a rendering-only request at its responsible boundary', () => {
    let roots = 0,
      pans = 0;
    const viewport = boundary(
      () => {
        roots++;
      },
      (e) => {
        if (e.type !== 'viewport.pan') return 'pass';
        pans++;
        return 'handled';
      },
    );
    boundary(viewport)({ type: 'viewport.pan', center: { x: 2, y: 3 } });
    expect([pans, roots]).toEqual([1, 0]);
  });
  it('reports unhandled drawing requests at Root', () => {
    expect(() =>
      transition(initialReady(fixture(), 1), { type: 'viewport.zoom', value: 1 }),
    ).toThrow('Unhandled drawing event');
  });
});
