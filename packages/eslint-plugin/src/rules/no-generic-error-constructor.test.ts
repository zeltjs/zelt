import { RuleTester } from 'eslint';
import rule from './no-generic-error-constructor';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
  },
});

ruleTester.run('no-generic-error-constructor', rule, {
  valid: [
    'throw new ZeltInternalError({ reason: "container_not_attached" });',
    'const error = new CaptureStackError();',
    'class CaptureStackError extends Error {}',
  ],
  invalid: [
    {
      code: 'throw new Error("boom");',
      errors: [{ messageId: 'genericError' }],
    },
    {
      code: 'const cause = new Error("boom");',
      errors: [{ messageId: 'genericError' }],
    },
  ],
});
