import path from 'node:path';
import type { Rule } from 'eslint';

const KNOWN_SUFFIXES = [
  'config',
  'service',
  'middleware',
  'controller',
  'decorator',
  'types',
  'lib',
  'test',
  'formatter',
];

interface FilePrefixAndSuffix {
  prefix: string;
  suffix: string | null;
}

function extractFilePrefixAndSuffix(filename: string): FilePrefixAndSuffix {
  const withoutExt = filename.replace(/\.ts$/, '');
  const parts = withoutExt.split('.');

  if (parts.length < 2) {
    return { prefix: parts[0] ?? '', suffix: null };
  }

  const lastPart = parts[parts.length - 1];

  if (lastPart && KNOWN_SUFFIXES.includes(lastPart)) {
    return {
      prefix: parts.slice(0, -1).join('.'),
      suffix: lastPart,
    };
  }

  return { prefix: withoutExt, suffix: null };
}

function prefixMatches(
  callerPrefix: string,
  callerSuffix: string | null,
  configPrefix: string,
): boolean {
  const normalize = (s: string) => s.replace(/[-._]/g, '-');

  if (normalize(callerPrefix) === normalize(configPrefix)) {
    return true;
  }

  if (callerSuffix) {
    const callerFull = `${callerPrefix}-${callerSuffix}`;
    if (normalize(callerFull) === normalize(configPrefix)) {
      return true;
    }
  }

  return false;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce that injectConfig() caller file prefix matches the config file prefix',
    },
    messages: {
      prefixMismatch:
        'injectConfig({{configName}}): caller prefix "{{callerPrefix}}" does not match config file prefix "{{configPrefix}}". Rename to {{expectedFile}}',
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename;
    const basename = path.basename(filename);
    const { prefix: callerPrefix, suffix: callerSuffix } = extractFilePrefixAndSuffix(basename);

    if (basename.endsWith('.config.ts') || basename.endsWith('.test.ts')) {
      return {};
    }

    const importedConfigs = new Map<string, { configPrefix: string; configFileName: string }>();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string' || !source.endsWith('.config')) {
          return;
        }

        const configFileName = path.basename(source) + '.ts';
        const { prefix: configPrefix } = extractFilePrefixAndSuffix(configFileName);

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name.endsWith('Config')
          ) {
            importedConfigs.set(specifier.local.name, {
              configPrefix,
              configFileName,
            });
          }
        }
      },

      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'injectConfig') {
          return;
        }

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== 'Identifier') {
          return;
        }

        const configName = firstArg.name;
        const configInfo = importedConfigs.get(configName);

        if (!configInfo) {
          return;
        }

        const { configPrefix } = configInfo;

        if (prefixMatches(callerPrefix, callerSuffix, configPrefix)) {
          return;
        }

        const fileParts = basename.split('.');
        const suffix = fileParts.slice(1).join('.');
        const expectedFile = `${configPrefix}.${suffix}`;

        context.report({
          node,
          messageId: 'prefixMismatch',
          data: {
            configName,
            callerPrefix,
            configPrefix,
            expectedFile,
          },
        });
      },
    };
  },
};

export default rule;
