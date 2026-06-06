import { createInjectableClassDecorator } from '../../../kernel';

// `@ErrorHandler` is applied without invocation (`@ErrorHandler` not
// `@ErrorHandler()`), so the decorator function itself is exported. Source
// position is not needed for ErrorHandler — only the `decorator` tag is used
// by collectors.
export const ErrorHandler = createInjectableClassDecorator(
  { decorator: 'ErrorHandler' } as const,
  undefined,
  { unique: true },
);
