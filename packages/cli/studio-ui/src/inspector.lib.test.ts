import { describe, expect, it } from 'vitest';

import type { ClassView } from './graph-view.lib';
import { findGraphNode, formatMethodSignature } from './inspector.lib';

describe('formatMethodSignature', () => {
  it('formats params and return type', () => {
    expect(
      formatMethodSignature({
        name: 'greet',
        params: [
          { name: 'name', type: 'string' },
          { name: 'loud', type: 'boolean' },
        ],
        returnType: 'Promise<string>',
      }),
    ).toBe('greet(name: string, loud: boolean): Promise<string>');
  });

  it('formats a no-arg method', () => {
    expect(formatMethodSignature({ name: 'now', params: [], returnType: 'string' })).toBe(
      'now(): string',
    );
  });
});

describe('findGraphNode', () => {
  const view: ClassView = {
    nodes: [
      {
        id: 'a',
        name: 'A',
        filePath: 'src/a.ts',
        fileKind: null,
        external: false,
        decorators: [],
        routes: [],
        methods: [],
      },
    ],
    edges: [],
  };
  it('finds a node by id', () => {
    expect(findGraphNode(view, 'a')?.name).toBe('A');
  });
  it('returns undefined for unknown id', () => {
    expect(findGraphNode(view, 'zz')).toBeUndefined();
  });
});
