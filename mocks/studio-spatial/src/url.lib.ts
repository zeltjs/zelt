import { createLoader, createSerializer, parseAsString, parseAsStringLiteral } from 'nuqs/server';
import type { UrlState } from './state.types';

const parsers = {
  node: parseAsString,
  root: parseAsString,
  mode: parseAsStringLiteral(['near', 'flow', 'all']).withDefault('near'),
  tab: parseAsStringLiteral(['contract', 'source']).withDefault('contract'),
};
const load = createLoader(parsers);
const serialize = createSerializer(parsers);

export function decodeUrl(search: string): UrlState {
  return load(search, { strict: true });
}

export function encodeUrl(base: string, value: UrlState): string {
  return serialize(base, value);
}
