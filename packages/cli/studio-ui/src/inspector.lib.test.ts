import { describe, expect, it } from 'vitest';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
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
  const graph: DependencyGraph = {
    version: 2,
    nodes: [{ id: 'a', className: 'A', filePath: 'src/a.ts', kind: 'service' }],
    edges: [],
  };
  it('finds a node by id', () => {
    expect(findGraphNode(graph, 'a')?.className).toBe('A');
  });
  it('returns undefined for unknown id', () => {
    expect(findGraphNode(graph, 'zz')).toBeUndefined();
  });
});
