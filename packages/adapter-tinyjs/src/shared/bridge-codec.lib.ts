import * as v from 'valibot';
import type { TinyjsBody, TinyjsFetchRequest, TinyjsFetchResponse } from './bridge.types';
import { BridgeRequestSchema, BridgeResponseSchema } from './bridge-validation.lib';

type ParseResult<T> = { ok: true; readonly value: T } | { ok: false; readonly error: TypeError };

export const parseBridgeRequest = (value: unknown): ParseResult<TinyjsFetchRequest> => {
  const parsed = v.safeParse(BridgeRequestSchema, value);
  return parsed.success
    ? { ok: true, value: parsed.output }
    : { ok: false, error: new TypeError('Invalid tinyjs Fetch request') };
};

export const parseBridgeResponse = (value: unknown): ParseResult<TinyjsFetchResponse> => {
  const parsed = v.safeParse(BridgeResponseSchema, value);
  return parsed.success
    ? { ok: true, value: parsed.output }
    : { ok: false, error: new TypeError('Invalid tinyjs Fetch response') };
};

// txiki.js 26.6 returns null for Request.signal when no signal was provided.
export const requestSignal = (request: Request): AbortSignal | null => request.signal;

export const encodeBytes = (buffer: ArrayBuffer): TinyjsBody => {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return { kind: 'base64', value: btoa(text) };
};

/** @throws {DOMException} */
export const decodeBody = (body: TinyjsBody): Uint8Array<ArrayBuffer> | null => {
  if (body.kind === 'none') return null;
  const text = atob(body.value);
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
};

export const collectHeaders = (headers: Headers): [string, string][] => {
  const entries: [string, string][] = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
};

/** @throws {TypeError} */
const originUrl = (origin: string): URL => {
  const base = new URL(origin);
  const extra = [base.search, base.hash, base.username, base.password].some(Boolean);
  if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || extra) {
    throw new TypeError('tinyjs Fetch URLs must use the configured HTTP origin');
  }
  return base;
};

/** @throws {TypeError} */
export const bridgeUrl = (path: string, origin: string): URL => {
  const base = originUrl(origin);
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.username || url.password) {
    throw new TypeError('tinyjs Fetch URLs must use the configured HTTP origin');
  }
  return url;
};
