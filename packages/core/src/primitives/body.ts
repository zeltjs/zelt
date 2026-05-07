import { match } from 'ts-pattern';

import { getEntryContext } from '../internal/entry-context';

type BodyTypeMap = {
  text: string;
  json: unknown;
  form: FormData;
  arrayBuffer: ArrayBuffer;
  blob: Blob;
};

type BodyType = keyof BodyTypeMap;

export function body(type: 'text'): Promise<string>;
export function body(type: 'json'): Promise<unknown>;
export function body(type: 'form'): Promise<FormData>;
export function body(type: 'arrayBuffer'): Promise<ArrayBuffer>;
export function body(type: 'blob'): Promise<Blob>;
export function body(type: BodyType): Promise<BodyTypeMap[BodyType]> {
  const req = getEntryContext().honoContext.req;
  return match(type)
    .with('text', () => req.text())
    .with('json', () => req.json())
    .with('form', () => req.formData())
    .with('arrayBuffer', () => req.arrayBuffer())
    .with('blob', () => req.blob())
    .exhaustive();
}
