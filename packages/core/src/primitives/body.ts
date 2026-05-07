import { getEntryContext } from '../internal/entry-context';

type BodyType = 'text' | 'json' | 'form' | 'arrayBuffer' | 'blob';

export function body(type: 'text'): Promise<string>;
export function body(type: 'json'): Promise<unknown>;
export function body(type: 'form'): Promise<FormData>;
export function body(type: 'arrayBuffer'): Promise<ArrayBuffer>;
export function body(type: 'blob'): Promise<Blob>;
export function body(type: BodyType): Promise<string | unknown | FormData | ArrayBuffer | Blob> {
  const req = getEntryContext().honoContext.req;
  switch (type) {
    case 'text':
      return req.text();
    case 'json':
      return req.json();
    case 'form':
      return req.formData();
    case 'arrayBuffer':
      return req.arrayBuffer();
    case 'blob':
      return req.blob();
  }
}
