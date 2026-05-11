import path from 'node:path';
import type { Rule } from 'eslint';
import type { ImportSpecifier } from 'estree';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce using injectConfig() instead of inject() for @Config classes',
    },
    messages: {
      useInjectConfig:
        'Use injectConfig({{configName}}) instead of inject({{configName}}). Classes from *.config.ts files must use injectConfig().',
    },
    fixable: 'code',
    schema: [],
  },

  create(context) {
    const configClasses = new Set<string>();
    let hasInjectConfigImport = false;
    let injectImportNode: ImportSpecifier | null = null;

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') {
          return;
        }

        if (source.endsWith('.config')) {
          const configFileName = `${path.basename(source)}.ts`;
          if (configFileName.endsWith('.config.ts')) {
            for (const specifier of node.specifiers) {
              if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name.endsWith('Config')
              ) {
                configClasses.add(specifier.local.name);
              }
            }
          }
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
            if (specifier.imported.name === 'injectConfig') {
              hasInjectConfigImport = true;
            }
            if (specifier.imported.name === 'inject') {
              injectImportNode = specifier;
            }
          }
        }
      },

      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'inject') {
          return;
        }

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== 'Identifier') {
          return;
        }

        const argName = firstArg.name;

        if (!configClasses.has(argName)) {
          return;
        }

        context.report({
          node,
          messageId: 'useInjectConfig',
          data: {
            configName: argName,
          },
          fix(fixer) {
            const fixes: Rule.Fix[] = [];

            fixes.push(fixer.replaceText(node.callee, 'injectConfig'));

            if (!hasInjectConfigImport && injectImportNode) {
              fixes.push(fixer.insertTextAfter(injectImportNode, ', injectConfig'));
              hasInjectConfigImport = true;
            }

            return fixes;
          },
        });
      },
    };
  },
};

export default rule;
