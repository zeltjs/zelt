import { readFileSync } from 'node:fs';
import { readGraph } from './graph.lib';

export function fixture() {
  const input: unknown = JSON.parse(
    readFileSync(new URL('../public/ec-backend.snapshot.json', import.meta.url), 'utf8'),
  );
  return readGraph(input);
}
