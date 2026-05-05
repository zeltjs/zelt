import { describe, expect, expectTypeOf, it } from 'vitest';

import { defineConfig, type GenerateClientOptions } from './options';

describe('defineConfig', () => {
  it('returns the input as-is (identity function)', () => {
    const cfg = defineConfig({ controllers: ['./src/**/*.controller.ts'], dist: './generated' });
    expect(cfg.controllers).toEqual(['./src/**/*.controller.ts']);
    expect(cfg.dist).toBe('./generated');
  });

  it('preserves narrow type', () => {
    const cfg = defineConfig({ controllers: ['./src/*.ts'], dist: './x' });
    expectTypeOf(cfg).toMatchTypeOf<GenerateClientOptions>();
  });

  it('accepts watch option', () => {
    const cfg = defineConfig({ controllers: ['./src/*.ts'], dist: './x', watch: true });
    expect(cfg.watch).toBe(true);
  });

  it('accepts multiple glob patterns', () => {
    const cfg = defineConfig({
      controllers: ['./src/api/*.controller.ts', './src/admin/*.controller.ts'],
      dist: './x',
    });
    expect(cfg.controllers.length).toBe(2);
  });
});
