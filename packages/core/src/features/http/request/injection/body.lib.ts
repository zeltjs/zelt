import { match } from 'ts-pattern';
import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltContextNotAvailableError,
} from '../../../../kernel';
import { BadRequestException, UnsupportedMediaTypeException } from '../../http.exceptions';

type FormBody = Record<string, string | File | (string | File)[]>;

export type ParsedBody =
  | { type: 'json'; val: unknown }
  | { type: 'form'; val: FormBody }
  | { type: 'text'; val: string }
  | { type: 'none'; val: undefined };

type BodyState = {
  readonly source?: BodySource;
  parsed?: Promise<ParsedBody>;
  raw?: Promise<string | undefined>;
  form?: Promise<ParsedBody>;
};

type BodyKind = 'json' | 'urlencoded' | 'multipart' | 'text' | 'none';

export type BodySource = {
  readonly contentType: string;
  readonly request: Request;
};

const BODY_CONTEXT = createContextKey<BodyState>('zelt:body');

const resolveBodyKind = (contentType: string): BodyKind => {
  if (contentType.includes('application/json')) return 'json';
  if (contentType.includes('application/x-www-form-urlencoded')) return 'urlencoded';
  if (contentType.includes('multipart/form-data')) return 'multipart';
  if (contentType.startsWith('text/')) return 'text';
  return 'none';
};

/** @throws {ZeltContextNotAvailableError} */
export const setBodySource = (source: BodySource): void => {
  setInternal(BODY_CONTEXT, { source });
};

// Lets injection middlewares at different router levels avoid replacing the
// body source. The request stream is still read lazily by body()/bodyRaw().
/** @throws {ZeltContextNotAvailableError} */
export const hasBodySource = (): boolean => getInternal(BODY_CONTEXT) !== undefined;

/** @throws {BadRequestException} */
export const readRequestBody = async (source: BodySource): Promise<string | undefined> => {
  if (resolveBodyKind(source.contentType) === 'none') {
    return undefined;
  }

  try {
    return await source.request.clone().text();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new BadRequestException({ reason: `Invalid body: ${message}` });
  }
};

/** @throws {BadRequestException} */
const parseJsonBody = (raw: string): ParsedBody => {
  try {
    const val: unknown = JSON.parse(raw);
    return { type: 'json', val };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new BadRequestException({ reason: `Invalid JSON: ${message}` });
  }
};

/** @throws {BadRequestException} */
const parseFormDataBody = async (source: BodySource): Promise<ParsedBody> => {
  try {
    const form: FormBody = {};
    const formData = await source.request.clone().formData();
    for (const [key, value] of formData) {
      appendFormField(form, key, value);
    }
    return { type: 'form', val: form };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new BadRequestException({ reason: `Invalid form data: ${message}` });
  }
};

/** @throws {BadRequestException} */
const parseTextBody = (raw: string): ParsedBody => {
  return { type: 'text', val: raw };
};

const appendFormField = (form: FormBody, key: string, value: string | File): void => {
  const current = form[key];
  if (current === undefined) {
    if (key.endsWith('[]')) {
      form[key] = [value];
      return;
    }
    form[key] = value;
    return;
  }
  if (Array.isArray(current)) {
    current.push(value);
    return;
  }
  form[key] = [current, value];
};

const parseUrlEncodedBody = (raw: string): ParsedBody => {
  const form: FormBody = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    appendFormField(form, key, value);
  }
  return { type: 'form', val: form };
};

/** @throws {BadRequestException} */
const parseRawBodyByKind = (kind: Exclude<BodyKind, 'multipart'>, raw: string): ParsedBody =>
  match(kind)
    .with('json', () => parseJsonBody(raw))
    .with('urlencoded', () => parseUrlEncodedBody(raw))
    .with('text', () => parseTextBody(raw))
    .with('none', () => ({ type: 'none', val: undefined }) satisfies ParsedBody)
    .exhaustive();

/** @throws {BadRequestException} */
export const parseRequestBody = async (source: BodySource): Promise<ParsedBody> => {
  const kind = resolveBodyKind(source.contentType);
  if (kind === 'multipart') return parseFormDataBody(source);
  return parseRawBodyByKind(kind, (await readRequestBody(source)) ?? '');
};

/** @throws {ZeltContextNotAvailableError} */
const getBodyState = (): BodyState => {
  const ctx = getInternal(BODY_CONTEXT);
  if (!ctx)
    throw new ZeltContextNotAvailableError({
      primitive: 'body',
      requiredContext: 'entry',
    });
  return ctx;
};

/** @throws {ZeltContextNotAvailableError} */
const ensureBodySource = (state: BodyState, primitive: string): BodySource => {
  if (!state.source)
    throw new ZeltContextNotAvailableError({
      primitive,
      requiredContext: 'entry',
    });
  return state.source;
};

/** @throws {ZeltContextNotAvailableError | BadRequestException} */
const getBodyRaw = async (): Promise<string | undefined> => {
  const state = getBodyState();
  if (!state.raw) {
    state.raw = readRequestBody(ensureBodySource(state, 'bodyRaw'));
  }
  return state.raw;
};

/** @throws {BadRequestException} */
const getFormBody = async (state: BodyState, source: BodySource): Promise<ParsedBody> => {
  if (!state.form) {
    state.form = parseFormDataBody(source);
  }
  return state.form;
};

/** @throws {ZeltContextNotAvailableError | BadRequestException} */
const parseCachedRequestBody = async (state: BodyState): Promise<ParsedBody> => {
  const source = ensureBodySource(state, 'body');
  const kind = resolveBodyKind(source.contentType);
  if (kind === 'multipart') return getFormBody(state, source);
  return parseRawBodyByKind(kind, (await getBodyRaw()) ?? '');
};

/** @throws {ZeltContextNotAvailableError | BadRequestException} */
export const getBody = async (): Promise<ParsedBody> => {
  const state = getBodyState();
  if (!state.parsed) {
    state.parsed = parseCachedRequestBody(state);
  }
  return state.parsed;
};

/** @throws {ZeltContextNotAvailableError | BadRequestException | UnsupportedMediaTypeException} */
export const bodyRaw = async (): Promise<string> => {
  const raw = await getBodyRaw();
  if (raw === undefined) {
    throw new UnsupportedMediaTypeException({ expected: 'raw', actual: (await getBody()).type });
  }
  return raw;
};

/** @throws {ZeltContextNotAvailableError | BadRequestException | UnsupportedMediaTypeException} */
export function body(type?: 'json'): Promise<unknown>;
/** @throws {ZeltContextNotAvailableError | BadRequestException | UnsupportedMediaTypeException} */
export function body(type: 'form'): Promise<FormBody>;
/** @throws {ZeltContextNotAvailableError | BadRequestException | UnsupportedMediaTypeException} */
export function body(type: 'text'): Promise<string>;
/** @throws {ZeltContextNotAvailableError | BadRequestException | UnsupportedMediaTypeException} */
export async function body(type: 'json' | 'form' | 'text' = 'json'): Promise<unknown> {
  const parsedBody = await getBody();

  if (parsedBody.type !== type) {
    throw new UnsupportedMediaTypeException({ expected: type, actual: parsedBody.type });
  }

  return parsedBody.val;
}
