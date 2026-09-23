import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixture } from './fixture.lib';
import { readGraph, required } from './graph.lib';

describe('fetched snapshot contract', () => {
  it('preserves the source-backed groups, declarations and relations', () => {
    const graph = fixture();
    expect([graph.groups.size, graph.declarations.size, graph.relations.length]).toEqual([
      35, 130, 238,
    ]);
    expect(graph.snapshot.provenance).toBe('manual-fixture');
    expect(graph.snapshot.graph).not.toHaveProperty('relations');
    for (const s of [...graph.groups.values(), ...graph.declarations.values()]) {
      expect(s.source.location.filePath).toBe(required(graph.owners, s.id).filePath);
      for (const r of s.relations) expect(r).not.toHaveProperty('from');
    }
  });
  it('preserves exact declaration excerpts and hides the config directory source', () => {
    for (const declaration of fixture().declarations.values()) {
      const { location, signature, excerpt } = declaration.source;
      const source = readFileSync(
        new URL(`../../../${location.filePath}`, import.meta.url),
        'utf8',
      );
      const span = source
        .split('\n')
        .slice(location.startLine - 1, location.endLine)
        .join('\n');
      expect(span, declaration.id).toContain(signature);
      if (excerpt.kind === 'code') expect(span, declaration.id).toContain(excerpt.text);
      if (location.filePath.startsWith('integration/ec-backend/src/config/'))
        expect(excerpt.kind, declaration.id).toBe('declaration-only');
    }
  });
  it('carries only the delivery shape: hints from plugins, no layout or entry data', () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL('../public/ec-backend.snapshot.json', import.meta.url), 'utf8'),
    );
    const text = JSON.stringify(raw);
    for (const removed of [
      'expandedY',
      'demoScenarios',
      '"entries"',
      '"hint"',
      'redacted',
      '"origin":"manual"',
    ])
      expect(text).not.toContain(removed);
    const graph = fixture();
    const hints = [...graph.declarations.values()].flatMap((d) => d.hints);
    expect(hints).toHaveLength(48);
    expect(new Set(hints.map((h) => h.provider))).toEqual(new Set(['zelt', 'drizzle', 'valibot']));
    expect([...graph.groups.values()].flatMap((g) => g.hints)).toEqual([]);
    expect(required(graph.declarations, 'OrderHandlers.startup@callback:0').hints).toEqual([
      { provider: 'zelt', label: 'EVENT order:created' },
    ]);
    expect(required(graph.declarations, 'OrderHandlers.startup').hints).toEqual([]);
    for (const hint of hints) expect(hint.label).not.toMatch(/^[A-Z]+ \/.*\/$/);
  });
  it('makes every argument callback its own declaration named by its order in the parent', () => {
    const graph = fixture();
    const callbacks = [...graph.declarations.values()].filter((d) => d.kind === 'callback');
    expect(callbacks).toHaveLength(18);
    for (const callback of callbacks) {
      const parent = callback.enclosingDeclarationId;
      if (parent === null) throw new Error(`${callback.id} has no parent`);
      expect(callback.name).toMatch(/^@callback:\d+$/);
      expect(callback.id).toBe(`${parent}${callback.name}`);
    }
    const createOrder = required(graph.declarations, 'OrderService.createOrder');
    expect(createOrder.relations.map((r) => r.kind)).not.toContain('table');
    expect(
      required(graph.declarations, 'OrderService.createOrder@callback:1').relations.map(
        (r) => r.to,
      ),
    ).toEqual(['products', 'orders', 'orderItems']);
  });
  it('puts external packages in one column as boundaries listing only what the app uses', () => {
    const graph = fixture();
    const app = [...graph.groups.values()].filter((g) =>
      g.filePath.startsWith('integration/ec-backend/src/'),
    );
    const external = [...graph.groups.values()].filter((g) => !app.includes(g));
    expect(external).toHaveLength(12);
    const used = new Set(
      app.flatMap((g) => [g, ...g.members]).flatMap((s) => s.relations.map((r) => r.to)),
    );
    for (const g of external) {
      expect(g).toMatchObject({ expansion: 'boundary', presentation: { columnId: 'column:6' } });
      expect(g.relations).toEqual([]);
      for (const m of g.members) {
        expect(used.has(m.id), m.id).toBe(true);
        expect(m.relations).toEqual([]);
        expect(m.unitTests.cases).toEqual([]);
      }
    }
    expect(graph.snapshot.graph.presentation.columns.at(-1)).toMatchObject({ label: '外部' });
    expect(graph.snapshot.graph.presentation.columns.map((c) => c.label)).not.toContain(
      'Port / interface',
    );
  });
  it('keeps one line when a plugin gives a read its meaning', () => {
    const graph = fixture();
    for (const s of [...graph.groups.values(), ...graph.declarations.values()]) {
      const reads = new Set(s.relations.filter((r) => r.kind === 'read').map((r) => r.to));
      for (const r of s.relations)
        if (['register', 'schema', 'table'].includes(r.kind))
          expect(reads.has(r.to), `${s.id} -> ${r.to}`).toBe(false);
    }
    expect(
      required(graph.declarations, 'OrderHandlers.startup')
        .relations.filter((r) => r.to === 'OrderHandlers.startup@callback:0')
        .map((r) => r.kind),
    ).toEqual(['register']);
  });
  it('draws contracts only to interface members on the map', () => {
    const graph = fixture();
    const contracts = graph.relations.filter((r) => r.kind === 'contract');
    expect(contracts).toHaveLength(6);
    for (const r of contracts)
      expect(required(graph.owners, r.to)).toMatchObject({ id: 'KVStore', kind: 'interface' });
  });
  it('keeps test identities and observed invocation locations under their targets', () => {
    const graph = fixture();
    expect([...graph.declarations.values()].flatMap((d) => d.unitTests.cases)).toHaveLength(0);
    const routes = [...graph.declarations.values()].filter((d) => d.e2eTests !== null);
    expect(routes).toHaveLength(16);
    const tests = routes.flatMap((d) => d.e2eTests?.cases ?? []);
    expect(new Set(tests.map((t) => t.id)).size).toBe(16);
    expect(required(graph.declarations, 'CreateProductSchema').unitTests.cases).toEqual([]);
    for (const test of tests) {
      const source = readFileSync(
        new URL(`../../../${test.location.filePath}`, import.meta.url),
        'utf8',
      );
      expect(source.split('\n').at(test.location.startLine - 1)).toContain(test.name);
      for (const request of test.requests) {
        expect(request.location.startLine).toBeGreaterThan(test.location.startLine);
        expect(request.location.endLine).toBeLessThanOrEqual(test.location.endLine);
      }
    }
  });
  it('rejects malformed shapes, duplicate identities, and dangling edges', () => {
    expect(() => readGraph({ schemaVersion: 2 })).toThrow();
    const snapshot = structuredClone(fixture().snapshot);
    snapshot.graph.groups.push(required(fixture().groups, 'JwtService'));
    expect(() => readGraph(snapshot)).toThrow('Duplicate');
    const dangling = structuredClone(fixture().snapshot);
    const group = dangling.graph.groups[0];
    if (!group) throw new Error('Fixture has no group');
    group.relations.push({ id: 'dangling', to: 'missing', kind: 'read', evidence: [] });
    expect(() => readGraph(dangling)).toThrow('Unknown identity');
  });
});
