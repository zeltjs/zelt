export const DEFAULT_TINYJS_ORIGIN = 'http://zelt-tinyjs';
export const TINYJS_FETCH_METHOD = 'zelt.fetch';

export type TinyjsBody = { kind: 'none' } | { kind: 'base64'; readonly value: string };

export type TinyjsFetchRequest = {
  readonly feature: string;
  readonly method: string;
  readonly path: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: TinyjsBody;
};

export type TinyjsFetchResponse = {
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: TinyjsBody;
};

export type TinyjsApiBridge = {
  readonly call: (method: string, params: TinyjsFetchRequest) => Promise<unknown>;
};

export type TinyjsNativeApp = {
  done: Promise<unknown>;
  readonly setTitle: (title: string) => unknown;
  readonly push: (event: string, data: unknown) => unknown;
  readonly quit: () => unknown;
};
