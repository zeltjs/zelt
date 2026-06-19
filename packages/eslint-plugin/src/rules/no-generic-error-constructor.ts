import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct construction of the generic Error class',
    },
    messages: {
      genericError:
        'Do not construct generic Error directly. Use a named domain error class instead.',
    },
    schema: [],
  },

  create(context) {
    return {
      NewExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'Error') return;

        context.report({
          node,
          messageId: 'genericError',
        });
      },
    };
  },
};

export default rule;
