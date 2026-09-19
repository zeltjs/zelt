import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getDecoratorApplicationPosition } from '../inspect/index';

const FIXTURE = resolve(__dirname, './fixtures/decorator-application-position/multi-marker.ts');

const hasTarget =
  (target: string) =>
  (props: object): boolean => {
    const record: { kind?: unknown; target?: unknown } = props;
    return record.kind === 'marker' && record.target === target;
  };

describe('getDecoratorApplicationPosition', () => {
  // レビュー: 同じ名前の decorator を同じメソッドに複数回適用すると、store.lib.ts の
  // upsertMethod は「最初に記録された1件」の trace しか保持しない設計だった
  // (InternalMethodMeta.trace)。この場合 TC39 の decorator 適用順(メソッド宣言に近い方から
  // 適用される)により2番目に書かれた `@Marker('second')` が先に適用され、その trace が
  // 両方の適用を代表してしまう。propTraces(props と同じ添字で対応する、適用ごとの trace)を
  // 追加したことで、各適用が自分自身の行を個別に持つことを検証する
  it('resolves the position of each individual method decorator application, not just the first-applied one', async () => {
    const { Sample } = await import('./fixtures/decorator-application-position/multi-marker');

    const firstPos = getDecoratorApplicationPosition(
      Sample,
      { kind: 'method', name: 'method' },
      hasTarget('first'),
    );
    const secondPos = getDecoratorApplicationPosition(
      Sample,
      { kind: 'method', name: 'method' },
      hasTarget('second'),
    );

    expect(firstPos?.sourceFile).toBe(FIXTURE);
    expect(secondPos?.sourceFile).toBe(FIXTURE);
    expect(firstPos?.line).toBe(10);
    expect(secondPos?.line).toBe(11);
    expect(firstPos?.line).not.toBe(secondPos?.line);
  });

  it('resolves the position of each individual class decorator application', async () => {
    const { Sample } = await import('./fixtures/decorator-application-position/multi-marker');

    const firstPos = getDecoratorApplicationPosition(Sample, { kind: 'class' }, hasTarget('first'));
    const secondPos = getDecoratorApplicationPosition(
      Sample,
      { kind: 'class' },
      hasTarget('second'),
    );

    expect(firstPos?.line).toBe(6);
    expect(secondPos?.line).toBe(7);
  });

  it('returns undefined when no application matches the predicate', async () => {
    const { Sample } = await import('./fixtures/decorator-application-position/multi-marker');

    const pos = getDecoratorApplicationPosition(
      Sample,
      { kind: 'method', name: 'method' },
      hasTarget('no-such'),
    );

    expect(pos).toBeUndefined();
  });

  it('returns undefined for a class with no recorded metadata', () => {
    class Plain {
      method(): void {}
    }

    const pos = getDecoratorApplicationPosition(
      Plain,
      { kind: 'method', name: 'method' },
      () => true,
    );

    expect(pos).toBeUndefined();
  });
});
