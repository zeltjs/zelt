import { runInContext, setInternal } from '../../../kernel/internal/context-key';
import type { HttpContextValue } from './context-keys';
import { HTTP_CONTEXT } from './context-keys';

type TestHttpContext = Partial<HttpContextValue> & {
  honoContext: HttpContextValue['honoContext'];
};

export const runInHttpContext = <T>(ctx: TestHttpContext, fn: () => T): T => {
  return runInContext(() => {
    setInternal(HTTP_CONTEXT, {
      body: ctx.body ?? { type: 'none', val: undefined },
      pathParams: ctx.pathParams ?? {},
      honoContext: ctx.honoContext,
    });
    return fn();
  });
};
