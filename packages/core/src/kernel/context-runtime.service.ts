import { Injectable } from './di';
import type { CapturedContext, ContextMode } from './internal';
import { createContextScope, defaultContextMode } from './internal';

@Injectable()
export class ContextRuntimeService {
  readonly mode: ContextMode;

  /** @throws {TypeError} */
  constructor(mode: ContextMode = defaultContextMode()) {
    // Validate the selected mode before any request or task starts.
    this.mode = createContextScope({ mode, inherit: false }).mode;
  }

  /** @throws {TypeError} */
  createScope(inherit = true): CapturedContext {
    return createContextScope({ mode: this.mode, inherit });
  }
}
