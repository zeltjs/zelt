import { readFileSync } from 'node:fs';
import type { Graph, Relation } from './graph.lib';
import { readGraph, required } from './graph.lib';

export function fixture(): Graph {
  const input: unknown = JSON.parse(
    readFileSync(new URL('../public/ec-backend.snapshot.json', import.meta.url), 'utf8'),
  );
  return readGraph(input);
}

function subjectName(graph: Graph, id: string): string {
  const group = graph.groups.get(id);
  if (group) return group.name;
  const declaration = required(graph.declarations, id);
  const enclosing = declaration.enclosingDeclarationId;
  if (enclosing !== null) return `${subjectName(graph, enclosing)}${declaration.name}`;
  return `${required(graph.owners, id).name}#${declaration.name}`;
}

function relationName(graph: Graph, relation: Relation): string {
  const provider = relation.origin === 'plugin' ? `${relation.provider}:` : '';
  return `${subjectName(graph, relation.from)} -${provider}${relation.kind}-> ${subjectName(graph, relation.to)}`;
}

function index(graph: Graph): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  const add = (id: string, name: string) => {
    // 名前が衝突したままでは、名前で書いたtestが別のものを指しても気付けない
    if (taken.has(name)) throw new Error(`Ambiguous display name: ${name}`);
    taken.add(name);
    names.set(id, name);
  };
  for (const id of [...graph.groups.keys(), ...graph.declarations.keys()])
    add(id, subjectName(graph, id));
  for (const relation of graph.relations) add(relation.id, relationName(graph, relation));
  return names;
}

const cache = new WeakMap<Graph, ReadonlyMap<string, string>>();

/**
 * 抽出器のIDは所在と構造をそのまま写した文字列なので、testは画面と同じ表示名
 * (group名・`Group#宣言名`・`Group#メソッド@callback:0`)で書き、ここでIDへ直す。
 */
export function displayNames(graph: Graph): ReadonlyMap<string, string> {
  const known = cache.get(graph);
  if (known) return known;
  const names = index(graph);
  cache.set(graph, names);
  return names;
}

const identities = new WeakMap<Graph, ReadonlyMap<string, string>>();

export function identity(graph: Graph, name: string): string {
  let byName = identities.get(graph);
  if (!byName) {
    byName = new Map([...displayNames(graph)].map(([id, value]) => [value, id]));
    identities.set(graph, byName);
  }
  return required(byName, name);
}
