import { describe, expect, it } from 'vitest';
import { declarationLabel, grantedKind, relationKind, relationLabel } from './labels';
import { declaration, granted, relation } from './snapshot-builder.lib';

describe('the screen shows a granted meaning, and the TS kind when none is granted', () => {
  it('names a read by the meaning a plugin granted, keeping the TS kind underneath', () => {
    const read = relation('A.run', 'Schema', 'read', [{ provider: 'valibot', kind: 'schema' }]);
    expect([read.kind, relationKind(read), relationLabel(relationKind(read))]).toEqual([
      'read',
      'schema',
      '入力検証schema参照',
    ]);
    expect(grantedKind(read)).toBeNull();
  });
  it('names a read without meanings by its TS kind', () => {
    expect(relationLabel(relationKind(relation('A.run', 'B.value', 'read')))).toBe('読む / 参照');
  });
  it('names a granted relation by its own kind and shows unknown kinds as they are', () => {
    const middleware = granted('A.run', 'M.use', 'middleware');
    expect([relationKind(middleware), grantedKind(middleware)]).toEqual([
      'middleware',
      'middleware',
    ]);
    expect(relationLabel('queue-consumer')).toBe('queue-consumer');
  });
  it('labels declarations by meaning first, then by the TS kind', () => {
    const table = declaration('orders', { meanings: [{ provider: 'drizzle', kind: 'table' }] });
    expect(declarationLabel(table)).toBe('TABLE');
    expect(declarationLabel(declaration('A.run'))).toBe('METHOD');
  });
});
