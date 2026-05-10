import path from 'node:path';
import type { Rule } from 'eslint';
import type { Identifier, Expression } from 'estree';

interface Decorator {
  expression: Expression;
}

const DI_DECORATORS = ['Config', 'Injectable', 'Controller', 'Middleware', 'ErrorHandler'];

const SUFFIX_MAP: Record<string, string> = {
  Config: 'config',
  Service: 'service',
  Controller: 'controller',
  Middleware: 'middleware',
  ErrorHandler: 'error-handler',
  Formatter: 'formatter',
  Transport: 'transport',
  Driver: 'driver',
};

function findDIDecorator(decorators: Decorator[]): string | null {
  for (const dec of decorators) {
    let name: string | null = null;

    if (dec.expression.type === 'Identifier') {
      name = dec.expression.name;
    } else if (
      dec.expression.type === 'CallExpression' &&
      dec.expression.callee.type === 'Identifier'
    ) {
      name = dec.expression.callee.name;
    }

    if (name && DI_DECORATORS.includes(name)) {
      return name;
    }
  }
  return null;
}

interface ParsedClassName {
  expectedPrefix: string | null;
  expectedSuffix: string | null;
}

function parseClassName(className: string): ParsedClassName {
  for (const [suffix, fileSuffix] of Object.entries(SUFFIX_MAP)) {
    if (className.endsWith(suffix)) {
      const withoutSuffix = className.slice(0, -suffix.length);
      const expectedPrefix = camelToKebab(withoutSuffix);
      return { expectedPrefix, expectedSuffix: fileSuffix };
    }
  }

  return { expectedPrefix: null, expectedSuffix: null };
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function extractFilePrefix(filename: string): string {
  const withoutExt = filename.replace(/\.ts$/, '');
  const parts = withoutExt.split('.');

  if (parts.length >= 2) {
    return parts.slice(0, -1).join('.');
  }

  return parts[0] ?? '';
}

function extractFileSuffix(filename: string): string {
  const withoutExt = filename.replace(/\.ts$/, '');
  const parts = withoutExt.split('.');

  return parts[parts.length - 1] ?? '';
}

function prefixMatches(actual: string, expected: string): boolean {
  const normalizePrefix = (p: string) => p.replace(/[-._]/g, '-');
  return normalizePrefix(actual) === normalizePrefix(expected);
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce that DI-decorated classes are in files with matching names',
    },
    messages: {
      fileNameMismatch:
        '@{{decorator}} class "{{className}}" should be in a file matching "{{expectedPattern}}", but found "{{actualFile}}"',
      unknownSuffix:
        '@{{decorator}} class "{{className}}" has unknown suffix. Use one of: {{knownSuffixes}}',
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename;
    const basename = path.basename(filename);

    if (basename.endsWith('.test.ts')) {
      return {};
    }

    return {
      ClassDeclaration(node) {
        const decorators = (node as unknown as { decorators?: Decorator[] }).decorators;
        if (!decorators || decorators.length === 0) {
          return;
        }

        const decorator = findDIDecorator(decorators);
        if (!decorator) {
          return;
        }

        const className = (node.id as Identifier | null)?.name;
        if (!className) {
          return;
        }

        const { expectedPrefix, expectedSuffix } = parseClassName(className);
        if (!expectedPrefix || !expectedSuffix) {
          context.report({
            node,
            messageId: 'unknownSuffix',
            data: {
              decorator,
              className,
              knownSuffixes: Object.keys(SUFFIX_MAP).join(', '),
            },
          });
          return;
        }

        const actualPrefix = extractFilePrefix(basename);
        const actualSuffix = extractFileSuffix(basename);

        if (actualSuffix !== expectedSuffix) {
          const expectedPattern = `${expectedPrefix}.${expectedSuffix}.ts (or with . _ separators)`;
          context.report({
            node,
            messageId: 'fileNameMismatch',
            data: {
              decorator,
              className,
              expectedPattern,
              actualFile: basename,
            },
          });
          return;
        }

        if (!prefixMatches(actualPrefix, expectedPrefix)) {
          const expectedPattern = `${expectedPrefix}.${expectedSuffix}.ts (or with . _ separators)`;
          context.report({
            node,
            messageId: 'fileNameMismatch',
            data: {
              decorator,
              className,
              expectedPattern,
              actualFile: basename,
            },
          });
        }
      },
    };
  },
};

export default rule;
