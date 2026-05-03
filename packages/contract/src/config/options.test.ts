import { describe, expect, expectTypeOf, it } from 'vitest';

import { defineConfig, type ControllerEntry, type GenerateClientOptions } from './options';

class A {}
class B {}

describe('defineConfig', () => {
  it('returns the input as-is (identity function)', () => {
    const cfg = defineConfig({ controllers: [A, B], dist: './generated' });
    expect(cfg.controllers).toEqual([A, B]);
    expect(cfg.dist).toBe('./generated');
  });

  it('preserves narrow type', () => {
    const cfg = defineConfig({ controllers: [A], dist: './x' });
    expectTypeOf(cfg).toMatchTypeOf<GenerateClientOptions>();
  });

  it('accepts watch option', () => {
    const cfg = defineConfig({ controllers: [A], dist: './x', watch: true });
    expect(cfg.watch).toBe(true);
  });

  it('accepts { class, source } entry form', () => {
    const cfg = defineConfig({
      controllers: [{ class: A, source: './a.ts' }],
      dist: './x',
    });
    expectTypeOf(cfg.controllers).toMatchTypeOf<readonly ControllerEntry[]>();
    expect(cfg.controllers[0]).toEqual({ class: A, source: './a.ts' });
  });

  it('accepts mixed entries (rare, supported by union)', () => {
    const cfg = defineConfig({
      controllers: [A, { class: B, source: './b.ts' }],
      dist: './x',
    });
    expect(cfg.controllers.length).toBe(2);
  });
});
