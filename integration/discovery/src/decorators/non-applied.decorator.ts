import { createClassDecorator } from '@zeltjs/decorator-metadata';

// Intentionally never applied — used to test that discovery returns
// empty when a discoverable decorator has no targets.
const NON_APPLIED_KEY = 'integration/discovery/NonApplied';

export const NonAppliedDecorator = () => createClassDecorator({ decorator: NON_APPLIED_KEY });

export const NON_APPLIED_DECORATOR_KEY = NON_APPLIED_KEY;

// A second, distinct non-applied decorator. Used to verify that two
// unrelated decorator factories do not share metadata keys nor pollute
// each other's discovery results.
const OTHER_NON_APPLIED_KEY = 'integration/discovery/OtherNonApplied';

export const OtherNonAppliedDecorator = () =>
  createClassDecorator({ decorator: OTHER_NON_APPLIED_KEY });

export const OTHER_NON_APPLIED_DECORATOR_KEY = OTHER_NON_APPLIED_KEY;
