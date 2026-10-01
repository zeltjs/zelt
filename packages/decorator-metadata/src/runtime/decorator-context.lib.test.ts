import { isMatching, P } from 'ts-pattern';
import { describe, expect, it } from 'vitest';
import { isClassContext, isFieldContext, isMethodContext } from './decorator-context.lib';

const previousPatterns = {
  class: { kind: 'class', metadata: P.optional(P.nonNullable) },
  method: {
    kind: 'method',
    metadata: P.optional(P.nonNullable),
    static: P.optional(P.boolean),
    name: P.optional(P.union(P.string, P.symbol)),
  },
  field: {
    kind: 'field',
    metadata: P.optional(P.nonNullable),
    static: P.optional(P.boolean),
    name: P.optional(P.union(P.string, P.symbol)),
  },
};
const matchesPrevious = (kind: keyof typeof previousPatterns, value: unknown): boolean =>
  isMatching(previousPatterns[kind], value);
const guards = { class: isClassContext, method: isMethodContext, field: isFieldContext };

describe('decorator context classification compatibility', () => {
  for (const kind of ['class', 'method', 'field'] as const) {
    it(`${kind} matches the previous matcher for valid and malformed contexts`, () => {
      const contexts: unknown[] = [undefined, null, false, 0, 'class', Symbol(), () => {}, {}, []];
      for (const actualKind of ['class', 'method', 'field', undefined, null, 1]) {
        for (const metadata of [undefined, null, {}, 0, false, 'metadata', Symbol()]) {
          for (const isStatic of [undefined, null, true, false, 0, 'false']) {
            for (const name of [undefined, null, 'member', Symbol(), 0]) {
              const context = { kind: actualKind, metadata, static: isStatic, name };
              contexts.push(context, Object.create(context));
            }
          }
        }
      }
      for (const value of contexts) {
        expect(guards[kind](value)).toBe(matchesPrevious(kind, value));
      }
    });

    it(`${kind} preserves proxy field access order and optional field reads`, () => {
      for (const fields of [
        { kind },
        { kind, metadata: {}, static: false, name: 'member' },
        { kind, metadata: null },
      ]) {
        const read = (guard: (value: unknown) => boolean) => {
          const events: string[] = [];
          const value = new Proxy(fields, {
            has(target, key) {
              events.push(`has:${String(key)}`);
              return Reflect.has(target, key);
            },
            get(target, key) {
              events.push(`get:${String(key)}`);
              return Reflect.get(target, key);
            },
          });
          return { result: guard(value), events };
        };
        expect(read(guards[kind])).toEqual(read((value) => matchesPrevious(kind, value)));
      }
    });

    it(`${kind} propagates a context getter's error unchanged`, () => {
      const error = new Error('context getter');
      const value = {
        kind,
        get metadata() {
          throw error;
        },
      };
      expect(() => guards[kind](value)).toThrow(error);
      expect(() => matchesPrevious(kind, value)).toThrow(error);
    });
  }
});
